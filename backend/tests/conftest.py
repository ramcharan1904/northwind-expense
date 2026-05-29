"""Shared fixtures and module stubs for tests that don't need a live DB or LLM."""
import sys
from types import ModuleType
from unittest.mock import MagicMock
import pytest


class _FakeSettings:
    database_url: str = "postgresql+asyncpg://test:test@localhost/test"
    anthropic_api_key: str = "sk-ant-test"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_api_key: str = "sk-test"
    storage_backend: str = "local"
    local_upload_dir: str = "uploads"
    r2_bucket: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_endpoint_url: str = ""
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    retrieval_top_k: int = 5
    policy_qa_min_similarity: float = 0.75
    citation_fuzzy_threshold: int = 90
    citation_semantic_threshold: float = 0.90
    confidence_penalty_per_failed_citation: float = 0.20


_fake_settings = _FakeSettings()


def _make_config_module():
    m = ModuleType("app.config")
    m.settings = _fake_settings
    m.get_settings = lambda: _fake_settings
    m.Settings = _FakeSettings
    return m


@pytest.fixture(autouse=False)
def stub_config(monkeypatch):
    """Inject a stub app.config so tests don't need a real .env file."""
    monkeypatch.setitem(sys.modules, "app.config", _make_config_module())
    yield
