import logging
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.verdicts import VerdictOutput, CitationItem
from app.schemas.receipts import ExtractionOutput
from app.services.llm_client import call_claude_structured
from app.services.citation_validator import validate_citation
from app.services.retrieval import RetrievedChunk
from app.models.verdicts import Verdict, VerdictCitation
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PROMPT_VERSION = "v1"

VERDICT_SYSTEM = """You are an expert expense compliance reviewer for Northwind Logistics.
Your job is to review a single expense receipt against company policy and return a structured verdict.

Verdicts:
- compliant: Receipt clearly meets all applicable policies
- flagged: Receipt likely violates a policy but requires human review (e.g., borderline amounts, missing context)
- rejected: Receipt clearly violates one or more policies (e.g., alcohol on solo travel, over hard caps)
- ambiguous: Insufficient information to make a confident determination

CRITICAL RULES:
1. Return valid JSON only — no explanation outside the JSON
2. Quoted text in cited_clauses MUST be the exact wording from the provided policy chunks
3. If you are not confident, prefer ambiguous over a wrong confident answer
4. Always include the policy document ID and section for each citation

Return exactly this JSON:
{
  "verdict": "compliant|flagged|rejected|ambiguous",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<clear explanation for the reviewer>",
  "cited_clauses": [
    {"doc_id": "<e.g. TEP-002>", "section": "<e.g. §2.3>", "quote": "<exact text from policy>"}
  ]
}"""


def _build_verdict_prompt(
    employee: dict,
    extraction: ExtractionOutput,
    chunks: list[RetrievedChunk],
) -> str:
    policy_context = "\n\n".join(
        f"[{c.doc_id} {c.section or ''}] (similarity: {c.similarity:.2f})\n{c.content}"
        for c in chunks
    )
    return f"""EMPLOYEE CONTEXT:
Name: {employee.get('name')}
Grade: {employee.get('grade')}
Department: {employee.get('department')}
Trip purpose: {employee.get('trip_purpose')}
Trip dates: {employee.get('trip_start')} to {employee.get('trip_end')}
Destination: {employee.get('destination')}

RECEIPT:
Vendor: {extraction.vendor}
Amount: {extraction.amount} {extraction.currency}
Category: {extraction.category}
Date: {extraction.expense_date}
Description: {extraction.description}
Extraction confidence: {extraction.extraction_confidence}

RELEVANT POLICY CHUNKS:
{policy_context}

Review this receipt against the policies above and return the verdict JSON."""


async def generate_verdict(
    db: AsyncSession,
    receipt_id: uuid.UUID,
    submission_id: uuid.UUID,
    employee: dict,
    extraction: ExtractionOutput,
    chunks: list[RetrievedChunk],
) -> Verdict:
    """Run the full verdict pipeline: LLM → citation validation → persist."""
    top_score = max((c.similarity for c in chunks), default=0.0)

    try:
        output: VerdictOutput = await call_claude_structured(
            system_prompt=VERDICT_SYSTEM,
            user_prompt=_build_verdict_prompt(employee, extraction, chunks),
            response_schema=VerdictOutput,
            context={"receipt_id": str(receipt_id)},
            prompt_version=PROMPT_VERSION,
        )
    except Exception as e:
        logger.error("verdict_llm_failed", extra={"receipt_id": str(receipt_id), "error": str(e)})
        output = VerdictOutput(
            verdict="ambiguous",
            confidence=0.0,
            reasoning="LLM unavailable after 3 attempts — human review required.",
            cited_clauses=[],
        )

    # Citation validation
    validated_citations: list[tuple[CitationItem, bool, float | None]] = []
    chunk_map = {f"{c.doc_id}_{c.section}": c for c in chunks}

    for clause in output.cited_clauses:
        chunk_key = f"{clause.doc_id}_{clause.section}"
        chunk = chunk_map.get(chunk_key) or next(
            (c for c in chunks if c.doc_id == clause.doc_id), None
        )
        if chunk:
            result = await validate_citation(clause.quote, chunk.content)
            if not result.valid:
                output.confidence = max(0.0, output.confidence - settings.confidence_penalty_per_failed_citation)
                if output.verdict != "ambiguous":
                    logger.warning("citation_failed_downgrading", extra={
                        "receipt_id": str(receipt_id),
                        "doc_id": clause.doc_id,
                    })
            validated_citations.append((clause, result.quote_verbatim, result.semantic_support))
        else:
            logger.warning("citation_chunk_not_found", extra={"doc_id": clause.doc_id})
            validated_citations.append((clause, False, None))
            output.confidence = max(0.0, output.confidence - settings.confidence_penalty_per_failed_citation)

    if output.confidence < 0.3 and output.verdict not in ("ambiguous",):
        output.verdict = "ambiguous"

    # Persist verdict
    verdict = Verdict(
        receipt_id=receipt_id,
        submission_id=submission_id,
        verdict=output.verdict,
        confidence=output.confidence,
        reasoning=output.reasoning,
        model_used=settings.anthropic_model,
        prompt_version=PROMPT_VERSION,
        retrieval_score=round(top_score, 3),
    )
    db.add(verdict)
    await db.flush()   # get verdict.id before citations

    # Find matching chunk IDs for FK
    chunk_id_map = {c.doc_id: uuid.UUID(c.id) for c in chunks}

    for clause, quote_verbatim, semantic_support in validated_citations:
        citation = VerdictCitation(
            verdict_id=verdict.id,
            policy_chunk_id=chunk_id_map.get(clause.doc_id),
            doc_id=clause.doc_id,
            section=clause.section,
            quoted_text=clause.quote,
            relevance_score=round(
                next((c.similarity for c in chunks if c.doc_id == clause.doc_id), 0.0), 3
            ),
            quote_verbatim=quote_verbatim,
            semantic_support=round(semantic_support, 3) if semantic_support else None,
        )
        db.add(citation)

    logger.info("verdict_generated", extra={
        "receipt_id": str(receipt_id),
        "verdict": output.verdict,
        "confidence": round(float(output.confidence), 3),
        "prompt_version": PROMPT_VERSION,
        "retrieval_score": round(top_score, 3),
    })
    return verdict
