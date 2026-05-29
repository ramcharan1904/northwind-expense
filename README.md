# Northwind Expense Review — AI-Assisted T&E Pre-Review System

A full-stack system that lets finance reviewers upload employee receipts, automatically checks them against policy PDFs using RAG + Claude, returns structured compliance verdicts, and supports human overrides. Built as an interview case study.

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.11+
- Node.js 20+
- Anthropic API key
- OpenAI API key

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in ANTHROPIC_API_KEY and OPENAI_API_KEY at minimum
```

```bash
cp northwind-expense/frontend/.env.local.example northwind-expense/frontend/.env.local
```

### 2. Start the database

```bash
docker-compose up -d db
```

This starts PostgreSQL 16 + pgvector and auto-runs the schema migrations (`001_schema.sql`, `003_views.sql`).

### 3. Seed employees

```bash
cd northwind-expense/backend
pip install -r requirements.txt
python scripts/seed_employees.py
```

Reads the 5 employee profiles from `case_study/submissions/*/employee_info.json` and upserts them into the database.

### 4. Start the backend

```bash
cd northwind-expense/backend
uvicorn app.main:app --reload
```

On startup, `policy_ingestion.py` runs automatically — it parses and embeds all 8 policy PDFs into pgvector. Idempotent; safe to restart.

### 5. Start the frontend

```bash
cd northwind-expense/frontend
npm install
npm run dev
```

Open http://localhost:3000 — you're running.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js 15)                      │
│  /submissions  /submissions/[id]  /history  /policy-qa           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ REST (JSON)
┌───────────────────────▼─────────────────────────────────────────┐
│                    FastAPI (Python 3.11)                          │
│                                                                   │
│  POST /submissions/{id}/receipts  ← main pipeline trigger        │
│    │                                                              │
│    ├─ StorageService.upload()      → local/R2 (relative path)    │
│    ├─ receipt_extraction.py        → PyMuPDF → Claude Vision      │
│    ├─ retrieval.py                 → pgvector cosine search       │
│    ├─ verdict_engine.py            → Claude (schema-constrained)  │
│    └─ citation_validator.py        → L1/L2/L3 validation          │
│                                                                   │
│  POST /policy-qa                   → RAG Q&A with refusal guard  │
│  POST /verdicts/{id}/override      → append-only audit trail     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ asyncpg
┌───────────────────────▼─────────────────────────────────────────┐
│            PostgreSQL 16 + pgvector                               │
│  employees / submissions / receipts / receipt_extractions         │
│  policy_documents / policy_chunks (Vector 1536)                   │
│  verdicts / verdict_citations / overrides                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions & Tradeoffs

### Why PostgreSQL + pgvector instead of Pinecone or Chroma

pgvector keeps all state — relational and vector — in one ACID-transactional store. For a system where overrides, verdicts, and policy chunks all need to cohere, avoiding distributed state machines matters more than the ~5× throughput improvement you'd get from a dedicated vector DB at 10K QPM. The ivfflat index with `lists=100` is fast enough at this scale. Migration path to Pinecone is straightforward if throughput requirements change: swap `retrieval.py` to call Pinecone, keep everything else identical.

### Why PyMuPDF first, Claude Vision as fallback

Cost: PyMuPDF extraction costs $0. Claude Vision costs ~$0.003–0.015 per image page. Most corporate receipts are machine-generated PDFs with embedded text; PyMuPDF gets >95% of them. The fallback threshold is `< 50 chars of extracted text` — catches scanned PDFs and photos without over-using Vision. The extraction method is stored on each receipt so the eval harness can measure Vision usage.

### Why section-based chunking instead of token-based

Policy PDFs are written in numbered sections (`§2.3 Meal Allowances`). Splitting on section boundaries keeps each chunk semantically coherent — a 300-token limit that cuts mid-clause makes retrieval much noisier. Section-aware chunking means fewer chunks are retrieved but each chunk is more relevant. The regex `r"(§\d+|^\d+\.\d+)"` handles both formats present in the Northwind policies.

### Verdict classification logic (flagged vs. rejected vs. ambiguous)

The verdict engine prompt instructs Claude to distinguish:
- **compliant** — receipt meets all applicable policy rules
- **flagged** — policy rule applies and the expense is borderline or needs human review (e.g., meal near the cap, receipt amount doesn't match booking)
- **rejected** — clear policy violation (e.g., alcohol on solo travel, personal expense claimed)
- **ambiguous** — insufficient evidence to classify; policy may not cover this category

Confidence is penalized (`-0.20` per citation) if citation validation fails, which can push a borderline case from `flagged` to `ambiguous`. This is intentional: surfacing uncertainty is better than confident wrong answers.

### 3-level citation faithfulness validator

LLMs frequently paraphrase rather than quote verbatim. A string equality check alone would reject ~40% of valid citations. The 3-level cascade:

1. **L1 — Exact match** (free, ~0ms): normalized substring check
2. **L2 — Fuzzy match** (rapidfuzz, ~5ms): sliding sentence/bigram windows at 90 ratio threshold — catches minor wording variants
3. **L3 — Semantic similarity** (~80ms, one OpenAI call): cosine similarity between quote and each chunk sentence — catches paraphrases like "not reimbursable during solo travel" ↔ "cannot expense alcohol when traveling alone"

Each citation row stores `quote_verbatim` (L1 pass) and `semantic_support` (L3 cosine score), enabling the eval harness to break down citation quality.

### Confidence-aware refusal in Policy Q&A

The system refuses to answer if `top_similarity < 0.75` (configurable via `POLICY_QA_MIN_SIMILARITY`). This means "I searched the policy documents and nothing is relevant enough" — the system returns a refusal message rather than hallucinating an answer. This is tested explicitly in the eval harness with out-of-scope questions (e.g., questions about HR processes not covered by T&E policies).

### Append-only override audit trail

All overrides are enforced append-only at the database level via `CREATE RULE`. No application code can silently delete or update an override. The `current_verdicts` database view resolves the latest override for each receipt. This means the full audit trail is always preserved, and reviewers can see the original AI verdict alongside every human override.

---

## Cost Per Submission Estimate

Assumptions: 5 receipts per submission, PDFs (PyMuPDF succeeds on 4, Vision needed on 1).

| Step | Model | Cost |
|------|-------|------|
| Receipt extraction × 4 (PyMuPDF) | — | $0 |
| Receipt extraction × 1 (Claude Vision) | claude-sonnet-4-6 | ~$0.008 |
| Embeddings for retrieval × 5 receipts | text-embedding-3-small | ~$0.0001 |
| Verdict generation × 5 receipts | claude-sonnet-4-6 | ~$0.04 |
| Citation semantic validation (worst case) | text-embedding-3-small | ~$0.0005 |
| **Total per submission** | | **~$0.05** |

---

## Running the Eval Harness

```bash
# After seeding + uploading all 5 case_study submissions via the API:
python eval/eval.py --expected eval/expected_results.json --api-url http://localhost:8000
```

Output includes:
- Verdict accuracy per submission
- Citation faithfulness breakdown (L1 exact / L2 fuzzy / L3 semantic / failed)
- Retrieval precision@5 (did correct policy documents appear?)
- Policy Q&A refusal rate on out-of-scope questions
- Confidence calibration (high-confidence verdicts should be more accurate)

---

## Scaling to 10K Submissions/Day

Current architecture processes receipts synchronously in the upload request (~3–8s per receipt depending on Vision usage). At 10K/day (avg 5 receipts = 50K extractions/day, ~35 QPS peak), synchronous processing would not hold.

**Changes needed:**
1. **Async job queue** — Move extraction + retrieval + verdict into ARQ (asyncio Redis Queue) workers. Upload endpoint returns 202 + job ID; frontend polls `GET /api/receipts/{id}/status`.
2. **Horizontal FastAPI workers** — Stateless; run 4–8 uvicorn replicas behind nginx or a load balancer.
3. **pgvector → Pinecone migration** — At ~1M+ policy chunks or high-QPS similarity search, swap `retrieval.py` to Pinecone. Schema and verdict engine are unaffected.
4. **R2 file storage** — Already abstracted behind `StorageService`; flip `STORAGE_BACKEND=r2` in `.env`.
5. **Connection pooling** — Add PgBouncer in front of Postgres; increase `asyncpg` pool size.

---

## What I'd Do Next

- **Better prompt versioning** — track `prompt_version` across A/B experiments; log accuracy by version
- **Feedback loop** — when a human overrides a verdict, log the (receipt, policy_chunks, ai_verdict, human_verdict) tuple for fine-tuning or few-shot prompt improvement
- **Multi-receipt cross-checks** — flag when total across all receipts in a submission exceeds the per-trip cap
- **PDF receipt preview** in the UI (embed the streamed file in an iframe)
- **Webhook on verdict** — notify the submitting employee via email when their submission is reviewed
- **Rate limit by employee** to prevent accidental mass uploads during testing
