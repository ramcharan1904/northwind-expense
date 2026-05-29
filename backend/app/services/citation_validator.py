import logging
from dataclasses import dataclass
from app.services.embeddings import embed_text, cosine_similarity
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class CitationResult:
    valid: bool
    quote_verbatim: bool
    semantic_support: float | None   # None if validated at L1/L2 or all levels failed


def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace for comparison."""
    return " ".join(text.lower().split())


async def validate_citation(quote: str, chunk_content: str) -> CitationResult:
    """3-level citation validation. First pass wins.

    L1 — Exact substring match (normalized)
    L2 — Sliding window fuzzy match (rapidfuzz)
    L3 — Semantic cosine similarity (reuses embeddings service)
    """
    norm_quote = _normalize(quote)
    norm_chunk = _normalize(chunk_content)

    # Level 1: Exact normalized match
    if norm_quote in norm_chunk:
        return CitationResult(valid=True, quote_verbatim=True, semantic_support=None)

    # Level 2: Sliding window fuzzy match
    try:
        from rapidfuzz import fuzz
        import nltk
        try:
            sentences = nltk.sent_tokenize(chunk_content)
        except LookupError:
            nltk.download("punkt_tab", quiet=True)
            sentences = nltk.sent_tokenize(chunk_content)

        windows = sentences.copy()
        for i in range(len(sentences) - 1):
            windows.append(f"{sentences[i]} {sentences[i + 1]}")

        for window in windows:
            score = fuzz.ratio(_normalize(quote), _normalize(window))
            if score > settings.citation_fuzzy_threshold:
                return CitationResult(valid=True, quote_verbatim=False, semantic_support=None)
    except Exception as e:
        logger.warning("citation_fuzzy_failed", extra={"error": str(e)})

    # Level 3: Semantic similarity
    try:
        import nltk
        try:
            sentences = nltk.sent_tokenize(chunk_content)
        except Exception:
            sentences = [chunk_content]

        if sentences:
            quote_emb = await embed_text(quote)
            for sentence in sentences:
                sent_emb = await embed_text(sentence)
                score = cosine_similarity(quote_emb, sent_emb)
                if score > settings.citation_semantic_threshold:
                    logger.info("citation_validated_semantic", extra={"score": round(score, 3)})
                    return CitationResult(valid=True, quote_verbatim=False, semantic_support=score)
    except Exception as e:
        logger.warning("citation_semantic_failed", extra={"error": str(e)})

    logger.warning("citation_validation_failed", extra={
        "quote_preview": quote[:80],
        "reason": "no_match_at_any_level",
    })
    return CitationResult(valid=False, quote_verbatim=False, semantic_support=None)
