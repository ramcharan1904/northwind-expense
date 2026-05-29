from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.logging_config import configure_logging
from app.routes import employees, submissions, receipts, verdicts, overrides, policy_qa

configure_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run policy ingestion on startup (idempotent)
    from app.services.policy_ingestion import ingest_policies
    await ingest_policies()
    yield


app = FastAPI(
    title="Northwind Expense Review API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employees.router)
app.include_router(submissions.router)
app.include_router(receipts.router)
app.include_router(verdicts.router)
app.include_router(overrides.router)
app.include_router(policy_qa.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
