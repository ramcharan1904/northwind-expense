import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.policy_qa import PolicyQARequest, PolicyQAResponse, CitedClause
from app.services.retrieval import retrieve_policy_chunks
from app.services.llm_client import call_claude_structured
from app.config import get_settings
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["policy_qa"])
settings = get_settings()

QA_SYSTEM = """You are a policy assistant for Northwind Logistics expense policies.
Answer questions using ONLY the provided policy excerpts.
If the excerpts do not contain enough information to answer, say so clearly — do not fabricate.
Always quote the exact policy text that supports your answer.

Return valid JSON only:
{
  "answer": "<your answer, or explanation of why you cannot answer>",
  "citations": [
    {"doc_id": "<e.g. TEP-002>", "section": "<e.g. §2.3>", "quoted_text": "<exact quote>", "similarity_score": <float>}
  ],
  "refused": <true|false>,
  "refusal_reason": "<reason if refused, else null>"
}"""


class _QAOutput(BaseModel):
    answer: str
    citations: list[CitedClause] = []
    refused: bool = False
    refusal_reason: str | None = None


@router.post("/policy-qa", response_model=PolicyQAResponse)
async def policy_qa(body: PolicyQARequest, db: AsyncSession = Depends(get_db)):
    # Retrieve relevant chunks
    chunks = await retrieve_policy_chunks(db, body.question, {})

    top_score = max((c.similarity for c in chunks), default=0.0)

    # Refuse if similarity is too low — prefer "I don't know" over hallucination
    if top_score < settings.policy_qa_min_similarity:
        logger.info("policy_qa_refused", extra={
            "reason": "low_similarity",
            "top_score": round(top_score, 3),
        })
        return PolicyQAResponse(
            answer="I cannot find relevant policy information to answer this question confidently.",
            citations=[],
            refused=True,
            refusal_reason=f"Top retrieval similarity ({top_score:.2f}) is below threshold ({settings.policy_qa_min_similarity}). The question may be outside the policy library.",
            top_similarity=top_score,
        )

    context = "\n\n".join(
        f"[{c.doc_id} {c.section or ''}] (similarity: {c.similarity:.2f})\n{c.content}"
        for c in chunks
    )

    try:
        output = await call_claude_structured(
            system_prompt=QA_SYSTEM,
            user_prompt=f"Question: {body.question}\n\nPolicy excerpts:\n{context}",
            response_schema=_QAOutput,
            prompt_version="qa_v1",
        )
    except Exception as e:
        logger.error("policy_qa_llm_failed", extra={"error": str(e)})
        return PolicyQAResponse(
            answer="Unable to answer due to a system error. Please try again.",
            refused=True,
            refusal_reason="LLM unavailable",
            top_similarity=top_score,
        )

    # Attach similarity scores from retrieval to citations
    chunk_similarity = {c.doc_id: c.similarity for c in chunks}
    for citation in output.citations:
        if not citation.similarity_score:
            citation.similarity_score = chunk_similarity.get(citation.doc_id, 0.0)

    if output.refused:
        logger.info("policy_qa_refused", extra={"reason": output.refusal_reason or "llm_refused"})

    return PolicyQAResponse(
        answer=output.answer,
        citations=output.citations,
        refused=output.refused,
        refusal_reason=output.refusal_reason,
        top_similarity=top_score,
    )
