import logging
import time
from typing import TypeVar, Type
from openai import AsyncOpenAI, RateLimitError, APITimeoutError, InternalServerError, APIStatusError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from pydantic import BaseModel, ValidationError
import json
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

T = TypeVar("T", bound=BaseModel)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def _should_retry(exc: BaseException) -> bool:
    if isinstance(exc, (RateLimitError, APITimeoutError, InternalServerError)):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        return True
    return False


async def call_claude_structured(
    system_prompt: str,
    user_prompt: str,
    response_schema: Type[T],
    context: dict | None = None,
    prompt_version: str = "v1",
) -> T:
    """Call OpenAI GPT-4o and parse response into a Pydantic model.
    Retries on transient errors. Falls back gracefully on persistent failures.
    """
    ctx = context or {}

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((RateLimitError, APITimeoutError, InternalServerError)),
        reraise=True,
    )
    async def _call_with_retry() -> T:
        attempt_start = time.monotonic()
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.openai_model,
            max_tokens=2048,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        elapsed_ms = int((time.monotonic() - attempt_start) * 1000)
        raw_text = response.choices[0].message.content or ""

        logger.info("llm_call", extra={
            "model": settings.openai_model,
            "prompt_version": prompt_version,
            "input_tokens": response.usage.prompt_tokens if response.usage else 0,
            "output_tokens": response.usage.completion_tokens if response.usage else 0,
            "latency_ms": elapsed_ms,
            **ctx,
        })

        return _parse_structured(raw_text, response_schema)

    return await _call_with_retry()


def _parse_structured(raw_text: str, schema: Type[T]) -> T:
    """Parse JSON from LLM response into Pydantic model. Handles markdown code fences."""
    text = raw_text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        data = json.loads(text)
        return schema.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.warning("llm_parse_error", extra={"error": str(e), "raw_preview": raw_text[:200]})
        raise ValueError(f"LLM response did not match expected schema: {e}") from e
