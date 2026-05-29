"""Tests for the citation validator — 3-level logic, no DB or LLM calls needed."""
import sys
import asyncio
import pytest
from types import ModuleType
from unittest.mock import MagicMock, AsyncMock

from tests.conftest import _make_config_module, _fake_settings


# ── module loader ─────────────────────────────────────────────────────────────

def _load_cv(embed_text_fn=None):
    """Load citation_validator with all external deps stubbed."""
    import numpy as np

    def _cosine(a, b):
        a, b = np.array(a, dtype=float), np.array(b, dtype=float)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na == 0 or nb == 0:
            return 0.0
        return float(np.dot(a, b) / (na * nb))

    emb_mod = ModuleType("app.services.embeddings")
    emb_mod.cosine_similarity = _cosine

    default_async_embed = AsyncMock(return_value=[0.0] * 1536)
    emb_mod.embed_text = embed_text_fn or default_async_embed

    sys.modules["app.config"] = _make_config_module()
    sys.modules["app.services.embeddings"] = emb_mod
    sys.modules.pop("app.services.citation_validator", None)
    import app.services.citation_validator as cv
    return cv, emb_mod


def _run(coro):
    return asyncio.run(coro)


# ── Level 1 — exact match ─────────────────────────────────────────────────────

class TestL1ExactMatch:
    def setup_method(self):
        self.cv, self.emb = _load_cv()

    def test_exact_match_returns_verbatim(self):
        result = _run(self.cv.validate_citation(
            quote="Meals shall not exceed $75 per person per meal",
            chunk_content="Meals shall not exceed $75 per person per meal for grades 1-6.",
        ))
        assert result.valid is True
        assert result.quote_verbatim is True
        assert result.semantic_support is None

    def test_case_insensitive_exact_match(self):
        result = _run(self.cv.validate_citation(
            quote="MEALS SHALL NOT EXCEED $75",
            chunk_content="Meals shall not exceed $75 per person per meal for grades 1-6.",
        ))
        assert result.valid is True
        assert result.quote_verbatim is True

    def test_extra_whitespace_normalised(self):
        result = _run(self.cv.validate_citation(
            quote="meals  shall  not  exceed $75",
            chunk_content="Meals shall not exceed $75 per person per meal.",
        ))
        assert result.valid is True
        assert result.quote_verbatim is True

    def test_no_match_in_empty_chunk(self):
        result = _run(self.cv.validate_citation(
            quote="Meals shall not exceed $75",
            chunk_content="",
        ))
        assert result.valid is False


# ── Level 2 — fuzzy / unrelated ───────────────────────────────────────────────

class TestL2FuzzyMatch:
    def setup_method(self):
        self.cv, self.emb = _load_cv()

    def test_completely_unrelated_quote_fails(self):
        """Unrelated quote + zero embed vectors → fails all levels."""
        result = _run(self.cv.validate_citation(
            quote="Employees must submit all receipts within 30 calendar days",
            chunk_content="Alcohol is never reimbursable during solo business travel.",
        ))
        assert result.valid is False

    def test_quote_longer_than_chunk_does_not_crash(self):
        """Validator should handle quote longer than any chunk window without raising."""
        result = _run(self.cv.validate_citation(
            quote="A" * 500,
            chunk_content="Short sentence. Another short sentence.",
        ))
        assert isinstance(result.valid, bool)


# ── Level 3 — semantic match ──────────────────────────────────────────────────

class TestL3SemanticMatch:
    def test_semantic_match_with_high_cosine(self):
        """Identical embedding vectors → cosine 1.0 > 0.90 threshold → valid."""
        import numpy as np
        base = np.random.rand(1536).tolist()

        async def _embed(text):
            return base  # identical for every call → cosine = 1.0

        cv, _ = _load_cv(embed_text_fn=_embed)
        result = _run(cv.validate_citation(
            quote="Reimbursement for alcohol is not permitted when traveling alone",
            chunk_content="Solo travel expenses must not include alcoholic beverages.",
        ))
        assert result.valid is True
        assert result.quote_verbatim is False
        assert result.semantic_support is not None and result.semantic_support > 0.89

    def test_low_semantic_score_fails(self):
        """Orthogonal embedding vectors → cosine 0.0 < 0.90 threshold → invalid."""
        import numpy as np
        v_quote = np.zeros(1536); v_quote[0] = 1.0
        v_sentence = np.zeros(1536); v_sentence[1] = 1.0

        call_count = [0]

        async def _embed(text):
            idx = call_count[0] % 2
            call_count[0] += 1
            return (v_quote if idx == 0 else v_sentence).tolist()

        cv, _ = _load_cv(embed_text_fn=_embed)
        result = _run(cv.validate_citation(
            quote="Reimbursement for alcohol is not permitted when traveling alone",
            chunk_content="Solo travel expenses must not include alcoholic beverages.",
        ))
        assert result.valid is False


# ── CitationResult dataclass ──────────────────────────────────────────────────

class TestCitationResult:
    def setup_method(self):
        self.cv, _ = _load_cv()

    def test_fields_valid_verbatim(self):
        r = self.cv.CitationResult(valid=True, quote_verbatim=True, semantic_support=None)
        assert r.valid is True
        assert r.quote_verbatim is True
        assert r.semantic_support is None

    def test_fields_with_semantic_support(self):
        r = self.cv.CitationResult(valid=True, quote_verbatim=False, semantic_support=0.93)
        assert r.semantic_support == pytest.approx(0.93)
