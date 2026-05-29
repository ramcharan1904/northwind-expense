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

PROMPT_VERSION = "v3"

VERDICT_SYSTEM = """You are an expert expense compliance reviewer for Northwind Logistics.
Your job is to review a single expense receipt against company policy and return a structured verdict.

VERDICT DEFINITIONS — apply these precisely:
- compliant: Receipt meets all applicable policies. Amount is within cap, no prohibited items, no policy concern.
- flagged: Receipt MIGHT violate policy — use when you need more information. Examples: non-itemised receipt on solo travel (cannot confirm no alcohol), amount borderline within 5% of cap.
- rejected: Receipt CLEARLY violates policy. Use ONLY when:
  * The computed amount explicitly EXCEEDS a stated hard cap (total ÷ nights > cap, or meal total > meal cap).
  * Alcohol charges are explicitly listed on a solo travel receipt.
  * Expense category is explicitly prohibited by policy.
  * DO NOT reject if the amount is within cap — within cap means compliant, period.
- ambiguous: ONLY when policy does not cover this category at all, or the receipt is so incomplete that no category can be determined.

HOTEL CAP RULE — follow this exactly:
1. Compute: nightly_rate = total_amount ÷ number_of_nights (use 1 if nights unknown).
2. Compare nightly_rate to the destination tier cap stated in policy.
3. If nightly_rate > cap → rejected (clear cap violation).
4. If nightly_rate ≤ cap → compliant. STOP. Do NOT look for other reasons to reject or flag.
5. If you cannot determine the cap from the retrieved policy chunks → ambiguous.
EXAMPLE: $470 total for 2 nights = $235/night. if total>$235/night reject if you have concrete evidence else flag it ambigous.

SOLO TRAVEL RULE — apply when trip_purpose indicates a single traveller:
1. If the receipt EXPLICITLY lists alcohol charges → rejected.
2. If the receipt is from a restaurant that typically serves alcohol AND the receipt is non-itemised → flagged (cannot verify no alcohol was ordered).
3. If the receipt is from a restaurant and the meal total is within the meal cap and no alcohol concern → compliant.
IMPORTANT: "any restaurants with bar facilities and if alcohol is served, and similar establishments that serve alcohol with meals are subject to rule (2) above when the traveller is solo and the receipt is not itemised. Apply flagged or rejected, not compliant.

CRITICAL RULES:
1. Return valid JSON only — no explanation outside the JSON
2. Quoted text in cited_clauses MUST be exact wording from the provided policy chunks
3. Always include the policy document ID and section for each citation
4. Within-cap hotel stays are COMPLIANT — never reject a receipt that is within the policy limit
5. Solo travel + non-itemised restaurant receipt = FLAGGED at minimum, never compliant

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
    raw_text: str | None = None,
) -> str:
    policy_context = "\n\n".join(
        f"[{c.doc_id} {c.section or ''}] (similarity: {c.similarity:.2f})\n{c.content}"
        for c in chunks
    )
    raw_section = (
        f"\nRAW RECEIPT TEXT (authoritative — use this for line-item detail):\n{raw_text[:1500]}\n"
        if raw_text else ""
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
{raw_section}
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
    raw_text: str | None = None,
) -> Verdict:
    """Run the full verdict pipeline: LLM → citation validation → persist."""
    top_score = max((c.similarity for c in chunks), default=0.0)

    try:
        output: VerdictOutput = await call_claude_structured(
            system_prompt=VERDICT_SYSTEM,
            user_prompt=_build_verdict_prompt(employee, extraction, chunks, raw_text),
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
        model_used=settings.openai_model,
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
