"""Policy ingestion — runs once on startup (idempotent).
Loads all PDFs from case_study/policies/, chunks by section, embeds, stores in pgvector.
"""
import asyncio
import logging
import re
import uuid
from pathlib import Path
from sqlalchemy import text, select
from app.database import AsyncSessionLocal
from app.models.policies import PolicyDocument, PolicyChunk
from app.services.embeddings import embed_batch
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Resolve relative to repo root regardless of working directory
_HERE = Path(__file__).parent.resolve()
POLICY_DIR = _HERE.parent.parent.parent.parent / "case_study" / "policies"
MAX_CHUNK_TOKENS = 500
OVERLAP_TOKENS = 50


def _extract_doc_metadata(text_content: str) -> dict:
    """Parse doc_id, title, version, effective_date from policy text."""
    doc_id = None
    title = None
    version = None
    effective_date = None

    # Match "Document: TEP-001" or "Document: TEP-001" patterns
    if m := re.search(r"Document:\s*([\w-]+)", text_content):
        doc_id = m.group(1).strip()

    # Match "Version: 3.2"
    if m := re.search(r"Version:\s*([\d.]+)", text_content):
        version = m.group(1).strip()

    # Match "Effective Date: January 1, 2025" or "2025-01-01"
    if m := re.search(r"Effective Date:\s*([^\n]+)", text_content):
        effective_date = m.group(1).strip()[:30]

    # First line of the PDF is usually the title
    lines = [l.strip() for l in text_content.splitlines() if l.strip()]
    if lines:
        title = lines[0][:200]

    return {
        "doc_id": doc_id,
        "title": title,
        "version": version,
        "effective_date": effective_date,
    }


def _chunk_by_section(text_content: str, doc_id: str) -> list[dict]:
    """Split policy text into section-based chunks (~300-500 tokens).
    Splits on numbered section headings like '1.', '2.1.', '§2.3', etc.
    """
    # Split on section headings
    section_pattern = re.compile(
        r"(?=\n(?:\d+\.\s|\d+\.\d+\.\s|§\d+|\b(?:Section|SECTION)\s+\d+))",
        re.MULTILINE,
    )
    parts = section_pattern.split(text_content)
    chunks = []
    current_section = None

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Detect section heading at start of part
        section_match = re.match(r"^(\d+(?:\.\d+)*\.?\s+\w+[^\n]*|§[\d.]+[^\n]*)", part)
        if section_match:
            current_section = section_match.group(1).strip()[:100]

        # Rough token count (1 token ≈ 4 chars)
        estimated_tokens = len(part) // 4

        if estimated_tokens > MAX_CHUNK_TOKENS:
            # Split large sections by sentence
            sentences = re.split(r"(?<=[.!?])\s+", part)
            window = []
            window_tokens = 0
            for sentence in sentences:
                s_tokens = len(sentence) // 4
                if window_tokens + s_tokens > MAX_CHUNK_TOKENS and window:
                    chunks.append({
                        "section": current_section,
                        "content": " ".join(window),
                        "token_count": window_tokens,
                    })
                    # Keep overlap
                    overlap = window[-2:] if len(window) > 2 else window
                    window = overlap + [sentence]
                    window_tokens = sum(len(s) // 4 for s in window)
                else:
                    window.append(sentence)
                    window_tokens += s_tokens
            if window:
                chunks.append({
                    "section": current_section,
                    "content": " ".join(window),
                    "token_count": window_tokens,
                })
        else:
            chunks.append({
                "section": current_section,
                "content": part,
                "token_count": estimated_tokens,
            })

    return chunks


async def ingest_policies() -> None:
    """Main entry point. Idempotent — skips if policy_documents already populated."""
    if not POLICY_DIR.exists():
        logger.warning("policy_dir_not_found", extra={"path": str(POLICY_DIR)})
        return

    async with AsyncSessionLocal() as db:
        # Idempotency check
        result = await db.execute(text("SELECT COUNT(*) FROM policy_documents"))
        count = result.scalar()
        if count and count > 0:
            logger.info("policy_ingestion_skipped", extra={"existing_docs": count})
            return

        pdf_files = sorted(POLICY_DIR.glob("*.pdf"))
        logger.info("policy_ingestion_starting", extra={"pdf_count": len(pdf_files)})

        for pdf_path in pdf_files:
            try:
                await _ingest_single_pdf(db, pdf_path)
            except Exception as e:
                logger.error("policy_pdf_failed", extra={"file": pdf_path.name, "error": str(e)})
                continue

        await db.commit()

        # Build ivfflat index after bulk insert for better cluster quality
        await db.execute(text("""
            CREATE INDEX IF NOT EXISTS policy_chunks_embedding_idx
            ON policy_chunks
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """))
        await db.commit()
        logger.info("policy_ingestion_complete", extra={"pdf_count": len(pdf_files)})


async def _ingest_single_pdf(db, pdf_path: Path) -> None:
    import fitz
    doc = fitz.open(str(pdf_path))
    full_text = "\n".join(page.get_text() for page in doc).strip()
    doc.close()

    if not full_text:
        logger.warning("pdf_empty_text", extra={"file": pdf_path.name})
        return

    # A single PDF may contain multiple policy documents separated by doc headers
    # Split on "Document: TEP-" boundaries
    doc_sections = re.split(r"(?=Document:\s+\w+-\d+)", full_text)

    for section_text in doc_sections:
        section_text = section_text.strip()
        if not section_text:
            continue

        meta = _extract_doc_metadata(section_text)
        if not meta["doc_id"]:
            # Use filename as fallback doc_id
            meta["doc_id"] = pdf_path.stem.upper()

        # Upsert policy_document
        existing = await db.execute(
            select(PolicyDocument).where(PolicyDocument.doc_id == meta["doc_id"])
        )
        existing = existing.scalar_one_or_none()
        if existing:
            logger.info("policy_doc_exists", extra={"doc_id": meta["doc_id"]})
            continue

        policy_doc = PolicyDocument(
            doc_id=meta["doc_id"],
            title=meta["title"],
            version=meta["version"],
            file_name=pdf_path.name,
        )
        db.add(policy_doc)
        await db.flush()

        # Chunk and embed
        chunks = _chunk_by_section(section_text, meta["doc_id"])
        chunk_texts = [c["content"] for c in chunks]

        try:
            embeddings = await embed_batch(chunk_texts)
        except Exception as e:
            logger.error("embedding_batch_failed", extra={"doc_id": meta["doc_id"], "error": str(e)})
            embeddings = [None] * len(chunks)

        for chunk_data, embedding in zip(chunks, embeddings):
            chunk = PolicyChunk(
                policy_document_id=policy_doc.id,
                doc_id=meta["doc_id"],
                section=chunk_data["section"],
                content=chunk_data["content"],
                embedding=embedding,
                token_count=chunk_data["token_count"],
            )
            db.add(chunk)

        logger.info("policy_doc_ingested", extra={
            "doc_id": meta["doc_id"],
            "chunks": len(chunks),
            "file": pdf_path.name,
        })


if __name__ == "__main__":
    asyncio.run(ingest_policies())
