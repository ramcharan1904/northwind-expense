import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Allow overriding the .env path via ENV_FILE env var so the backend can be
# started from any working directory (e.g. scripts run from repo root).
_DEFAULT_ENV = Path(__file__).parent.parent.parent / ".env"
_ENV_FILE = os.environ.get("ENV_FILE", str(_DEFAULT_ENV))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://northwind:northwind_dev@localhost:5433/northwind"

    # LLMs
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # File storage
    storage_backend: str = "local"       # "local" | "r2"
    local_upload_dir: str = "uploads"
    r2_bucket: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_endpoint_url: str = ""

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    # Retrieval / validation thresholds (all configurable — never hardcoded in services)
    retrieval_top_k: int = 5
    policy_qa_min_similarity: float = 0.45
    citation_fuzzy_threshold: int = 90
    citation_semantic_threshold: float = 0.90
    confidence_penalty_per_failed_citation: float = 0.20


@lru_cache
def get_settings() -> Settings:
    return Settings()
