import logging
from dataclasses import dataclass
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.embeddings import embed_text
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class RetrievedChunk:
    id: str
    doc_id: str
    doc_title: str | None
    section: str | None
    content: str
    similarity: float


async def retrieve_policy_chunks(
    db: AsyncSession,
    receipt_text: str,
    employee_context: dict,
) -> list[RetrievedChunk]:
    """Embed receipt + employee context, retrieve top-K policy chunks via pgvector."""

    # Build rich query that includes employee context — grade affects policy limits
    query_parts = [receipt_text]
    if employee_context.get("grade"):
        query_parts.append(f"Employee grade: {employee_context['grade']}")
    if employee_context.get("department"):
        query_parts.append(f"Department: {employee_context['department']}")
    if employee_context.get("trip_purpose"):
        query_parts.append(f"Trip purpose: {employee_context['trip_purpose']}")
    if employee_context.get("destination"):
        query_parts.append(f"Destination: {employee_context['destination']}")

    combined_query = "\n".join(query_parts)
    embedding = await embed_text(combined_query)

    result = await db.execute(
        text("""
            SELECT
                pc.id::text,
                pc.doc_id,
                pd.title AS doc_title,
                pc.section,
                pc.content,
                1 - (pc.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM policy_chunks pc
            LEFT JOIN policy_documents pd ON pd.id = pc.policy_document_id
            ORDER BY pc.embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """),
        {"embedding": str(embedding), "top_k": settings.retrieval_top_k},
    )

    chunks = [
        RetrievedChunk(
            id=row.id,
            doc_id=row.doc_id,
            doc_title=row.doc_title,
            section=row.section,
            content=row.content,
            similarity=float(row.similarity),
        )
        for row in result.fetchall()
    ]

    top_score = chunks[0].similarity if chunks else 0.0
    logger.info("retrieval_complete", extra={
        "top_score": round(top_score, 3),
        "chunks_retrieved": len(chunks),
    })
    return chunks
