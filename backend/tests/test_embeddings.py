"""Tests for the embeddings service — pure math, no API calls."""
import sys
import pytest
import numpy as np
from types import ModuleType
from unittest.mock import MagicMock

from tests.conftest import _make_config_module


def _load_embeddings():
    sys.modules["app.config"] = _make_config_module()
    # stub openai so import doesn't fail without a key
    openai_mod = ModuleType("openai")
    openai_mod.AsyncOpenAI = MagicMock
    sys.modules["openai"] = openai_mod
    sys.modules.pop("app.services.embeddings", None)
    import app.services.embeddings as emb
    return emb


class TestCosineSimilarity:
    def setup_method(self):
        self.emb = _load_embeddings()

    def test_identical_vectors(self):
        v = [1.0, 0.0, 0.0]
        assert self.emb.cosine_similarity(v, v) == pytest.approx(1.0, abs=1e-6)

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0, 0.0]
        b = [0.0, 1.0, 0.0]
        assert self.emb.cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-6)

    def test_opposite_vectors(self):
        a = [1.0, 0.0]
        b = [-1.0, 0.0]
        assert self.emb.cosine_similarity(a, b) == pytest.approx(-1.0, abs=1e-6)

    def test_similar_vectors(self):
        a = [1.0, 1.0, 0.0]
        b = [1.0, 0.8, 0.2]
        sim = self.emb.cosine_similarity(a, b)
        assert 0.9 < sim < 1.0

    def test_zero_vector_returns_zero(self):
        a = [0.0, 0.0, 0.0]
        b = [1.0, 0.0, 0.0]
        assert self.emb.cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-6)
