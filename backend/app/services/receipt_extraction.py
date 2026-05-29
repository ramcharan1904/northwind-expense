import logging
import base64
from pathlib import Path
from app.schemas.receipts import ExtractionOutput
from app.services.llm_client import call_claude_structured
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

EXTRACTION_SYSTEM = """You are a receipt data extractor for an expense management system.
Extract structured data from the receipt and return valid JSON only — no explanation, no markdown.
If a field cannot be determined, use null.
Return exactly this JSON structure:
{
  "amount": <number or null>,
  "currency": "<3-letter code or null>",
  "vendor": "<merchant name or null>",
  "category": "<one of: airfare, hotel, meal, ground_transportation, conference, other or null>",
  "expense_date": "<YYYY-MM-DD or null>",
  "cardholder_name": "<name printed on card or receipt, or null if not present>",
  "description": "<brief description or null>",
  "extraction_confidence": <0.0 to 1.0>
}"""


async def extract_receipt(file_bytes: bytes, file_type: str, filename: str) -> tuple[str, str, ExtractionOutput]:
    """Extract structured data from a receipt file.
    Returns (raw_text, extraction_method, ExtractionOutput).
    """
    file_type = file_type.lower()

    if file_type == "txt":
        return await _extract_plaintext(file_bytes)
    elif file_type == "pdf":
        return await _extract_pdf(file_bytes, filename)
    elif file_type in ("jpg", "jpeg", "png"):
        return await _extract_image(file_bytes, file_type)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


async def _extract_plaintext(file_bytes: bytes) -> tuple[str, str, ExtractionOutput]:
    raw_text = file_bytes.decode("utf-8", errors="replace")
    extraction = await _call_extraction_llm(raw_text)
    return raw_text, "plaintext", extraction


async def _extract_pdf(file_bytes: bytes, filename: str) -> tuple[str, str, ExtractionOutput]:
    import fitz  # PyMuPDF
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        raw_text = "\n".join(page.get_text() for page in doc).strip()
        doc.close()
    except Exception as e:
        logger.warning("pymupdf_failed", extra={"file_name": filename, "error": str(e)})
        raw_text = ""

    if len(raw_text) >= 50:
        extraction = await _call_extraction_llm(raw_text)
        return raw_text, "pymupdf", extraction

    # Fallback: Claude Vision on the first page as image
    logger.info("pdf_vision_fallback", extra={"file_name": filename})
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        doc.close()
        raw_text_v, method, extraction = await _extract_image(img_bytes, "png")
        return raw_text_v or raw_text, method, extraction
    except Exception as e:
        logger.error("pdf_vision_fallback_failed", extra={"file_name": filename, "error": str(e)})
        return raw_text, "pymupdf", _fallback_extraction()


async def _extract_image(file_bytes: bytes, file_type: str) -> tuple[str, str, ExtractionOutput]:
    media_type_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
    media_type = media_type_map.get(file_type.lower(), "image/png")
    b64 = base64.standard_b64encode(file_bytes).decode("utf-8")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_type};base64,{b64}"},
                    },
                    {"type": "text", "text": "Extract receipt data from this image. Return JSON only."},
                ],
            },
        ],
    )
    raw_text = response.choices[0].message.content or ""

    try:
        from app.services.llm_client import _parse_structured
        extraction = _parse_structured(raw_text, ExtractionOutput)
    except ValueError:
        extraction = _fallback_extraction()

    return "", "gpt4o_vision", extraction


async def _call_extraction_llm(raw_text: str) -> ExtractionOutput:
    try:
        return await call_claude_structured(
            system_prompt=EXTRACTION_SYSTEM,
            user_prompt=f"Extract data from this receipt:\n\n{raw_text[:3000]}",
            response_schema=ExtractionOutput,
            prompt_version="extraction_v1",
        )
    except Exception as e:
        logger.error("extraction_llm_failed", extra={"error": str(e)})
        return _fallback_extraction()


def _fallback_extraction() -> ExtractionOutput:
    return ExtractionOutput(extraction_confidence=0.0)
