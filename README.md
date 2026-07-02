# Northwind Expense Review — AI-Assisted T&E Pre-Review System

A full-stack system that lets finance reviewers upload employee receipts, automatically checks them against policy PDFs using RAG + GPT-4o, returns structured compliance verdicts, and supports human overrides with a full audit trail.

---

## What We Built

### 6 Core Capabilities — All Implemented

| # | Capability | Status |
|---|-----------|--------|
| 1 | Create submissions, select or create employees | ✅ |
| 2 | Upload receipts (PDF, JPG, PNG, TXT) with auto-extraction | ✅ |
| 3 | AI pre-review: verdict, reasoning, citations, confidence | ✅ |
| 4 | Human override with append-only audit trail | ✅ |
| 5 | Submission history with filter by employee and status | ✅ |
| 6 | Policy Q&A with grounded citations and refusal guard | ✅ |

### Key Behaviours Implemented

- **Duplicate draft prevention** — 409 if the same employee submits a draft for the same destination and dates
- **Submission lifecycle enforced** — `draft → pending → reviewed → approved/rejected` with auto-transitions
  - Moving to `pending` auto-advances to `reviewed` if all receipts already have verdicts
  - Moving to `reviewed` is triggered automatically when the last receipt receives a verdict
- **Human override is final** — overriding a verdict immediately resolves the submission status; no extra click needed
  - Override to `rejected` → submission instantly `rejected`
  - Override to `compliant` with no remaining rejections → submission instantly `approved`
- **Approve button faded** (disabled with tooltip) when any receipt is `rejected` or `ambiguous`
- **Backend enforces the same rule** — 422 if Approve is attempted via API with unresolved receipts
- **Overriding after approval reverts to re-review** — the system recalculates immediately based on updated verdicts
- **3-level citation validator** — exact match → rapidfuzz fuzzy → semantic cosine; confidence penalised per failed citation
- **Policy Q&A refuses out-of-scope questions** — similarity threshold (0.45, calibrated for `text-embedding-3-small`) prevents hallucination

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.11+
- Node.js 20+
- OpenAI API key (used for both GPT-4o verdicts/extraction and `text-embedding-3-small` embeddings)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in OPENAI_API_KEY at minimum
```

```bash
cp frontend/.env.local.example frontend/.env.local
```

### 2. Start the database

```bash
docker-compose up -d db
```

Starts PostgreSQL 16 + pgvector on port 5433. Auto-runs `001_schema.sql` and `003_views.sql` on first boot.

### 3. Seed employees

```bash
cd backend
pip install -r requirements.txt
python scripts/seed_employees.py
```

Reads the 5 employee profiles from `case_study/submissions/*/employee_info.json` and upserts them into the database.

### 4. Start the backend

```bash
cd backend
uvicorn app.main:app --port 8000
```

On startup, policy ingestion runs automatically — parses and embeds all 8 policy PDFs (832 chunks) into pgvector. Idempotent; safe to restart.

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (Next.js 15)                         │
│  /submissions  /submissions/[id]  /history  /policy-qa           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ REST (JSON)
┌───────────────────────▼─────────────────────────────────────────┐
│                    FastAPI (Python 3.11)                          │
│                                                                   │
│  POST /submissions/{id}/receipts  ← main pipeline trigger        │
│    │                                                              │
│    ├─ StorageService.upload()      → local filesystem            │
│    ├─ receipt_extraction.py        → PyMuPDF → GPT-4o Vision     │
│    ├─ retrieval.py                 → pgvector cosine search       │
│    ├─ verdict_engine.py            → GPT-4o (schema-constrained) │
│    └─ citation_validator.py        → L1/L2/L3 validation          │
│                                                                   │
│  POST /policy-qa                   → RAG Q&A with refusal guard  │
│  POST /verdicts/{id}/override      → append-only audit trail     │
│                            + immediate submission status resolve  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ asyncpg
┌───────────────────────▼─────────────────────────────────────────┐
│            PostgreSQL 16 + pgvector (port 5433)                   │
│  employees / submissions / receipts / receipt_extractions         │
│  policy_documents / policy_chunks (vector 1536)                   │
│  verdicts / verdict_citations / overrides (append-only)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## LLM Stack

| Purpose | Model |
|---------|-------|
| Receipt extraction (text) | GPT-4o (`gpt-4o`) |
| Receipt extraction (image/scanned PDF) | GPT-4o Vision |
| Policy verdict + reasoning | GPT-4o (`gpt-4o`) |
| Policy Q&A | GPT-4o (`gpt-4o`) |
| Embeddings (retrieval + citation semantic validation) | `text-embedding-3-small` (1536 dims) |

All LLM calls go through `services/llm_client.py` — a single wrapper with tenacity retry (3 attempts, exponential backoff on rate limit / timeout / 5xx). Schema-constrained JSON output everywhere via Pydantic v2.

---

## Design Decisions & Tradeoffs

### Why PostgreSQL + pgvector instead of Pinecone

pgvector keeps all state — relational and vector — in one ACID-transactional store. For a system where overrides, verdicts, and policy chunks all need to cohere, avoiding distributed state machines matters more than the throughput improvement you'd get from a dedicated vector DB at scale. Migration path to Pinecone is straightforward: swap `retrieval.py`, keep everything else identical.

### Why PyMuPDF first, GPT-4o Vision as fallback

Cost: PyMuPDF extraction costs $0. GPT-4o Vision costs per image token. Most corporate receipts are machine-generated PDFs with embedded text — PyMuPDF gets the majority of them. The fallback threshold is `< 50 chars of extracted text`, which catches scanned PDFs and photos without over-using Vision. The extraction method is stored on each receipt (`pymupdf`, `gpt4o_vision`, `plaintext`).

### Why section-based chunking instead of token-based

Policy PDFs are written in numbered sections (`§2.3 Meal Allowances`). Splitting on section boundaries keeps each chunk semantically coherent. Section-aware chunking means fewer chunks retrieved but each is more relevant. Result: 832 chunks across 38 documents from 8 PDFs.

### Verdict classification logic

The verdict engine instructs GPT-4o to distinguish:
- **compliant** — meets all applicable policy rules
- **flagged** — borderline or needs human review (near the cap, amount mismatch)
- **rejected** — clear policy violation (alcohol on solo travel, personal expense)
- **ambiguous** — insufficient evidence; policy may not cover this category

Confidence is penalised (`-0.20` per citation) when citation validation fails — surfacing uncertainty is better than confident wrong answers.

### 3-level citation faithfulness validator

LLMs frequently paraphrase rather than quote verbatim. The 3-level cascade:

1. **L1 — Exact match** (free, ~0ms): normalised substring check
2. **L2 — Fuzzy match** (rapidfuzz, ~5ms): sliding sentence/bigram windows at configurable ratio threshold
3. **L3 — Semantic similarity** (~80ms, one OpenAI call): cosine similarity between quote and each chunk sentence — catches paraphrases

Each citation row stores `quote_verbatim` (L1 pass) and `semantic_support` (L3 cosine score) for eval harness breakdown.

### Human override is final

When a reviewer overrides a verdict, it immediately re-evaluates all current verdicts for the submission and resolves the status — no extra Approve/Reject click required. The Approve button is disabled (faded with tooltip) when any receipt is `rejected` or `ambiguous`. The same rule is enforced server-side with a 422.

### Append-only override audit trail

Overrides are enforced append-only at the database level via `CREATE RULE`. No application code can silently delete or update an override. The `current_verdicts` view resolves the latest override per receipt. The original AI verdict is always preserved.

### Confidence-aware refusal in Policy Q&A

The system refuses to answer if `top_similarity < 0.45` (configurable via `POLICY_QA_MIN_SIMILARITY`). Threshold is calibrated to `text-embedding-3-small` cosine similarity range (0.4–0.65 for relevant matches). Returns a clear refusal message with the actual similarity score rather than hallucinating an answer.

---

## Cost Per Submission Estimate

Assumptions: 5 receipts per submission, PDFs (PyMuPDF succeeds on 4, Vision needed on 1).

| Step | Model | Cost |
|------|-------|------|
| Receipt extraction × 4 (PyMuPDF) | — | $0 |
| Receipt extraction × 1 (GPT-4o Vision) | gpt-4o | ~$0.005 |
| Embeddings for retrieval × 5 receipts | text-embedding-3-small | ~$0.0001 |
| Verdict generation × 5 receipts | gpt-4o | ~$0.04 |
| Citation semantic validation (worst case) | text-embedding-3-small | ~$0.0005 |
| **Total per submission** | | **~$0.05** |

---

## Evaluation Harness

```bash
python eval/eval.py --expected eval/expected_results.json --api-url http://localhost:8000
```

Drop in any JSON file of expected outcomes — the harness fetches each verdict by ID and computes all metrics automatically. To test against a held-out set, replace `expected_results.json` with your file using the same schema:

```json
[
  {"type": "verdict", "verdict_id": "<uuid>", "expected_verdict": "rejected", "expected_citations": ["TEP-002"]},
  {"type": "refusal", "question": "How do I apply for parental leave?"}
]
```

### Metrics chosen and why

**1. Verdict accuracy** — the primary signal. Did the system produce the correct compliance decision? Wrong verdicts are the failure mode that matters most to a finance reviewer.

**2. Citation faithfulness (3-level breakdown)** — LLMs frequently hallucinate or paraphrase citations. This metric catches that before it reaches a reviewer. Three levels are tracked separately because they represent different quality tiers: exact verbatim quotes (L1) are strongest evidence; fuzzy matches (L2) indicate paraphrase; semantic matches (L3) catch conceptual accuracy but not literal faithfulness. A verdict citing non-existent policy text is worse than a wrong verdict — it's confidently wrong.

**3. Retrieval precision@5** — measures whether the right policy chunks appear in the top-5 retrieved results. If the right policy never reaches the LLM, no prompt engineering can fix it. This metric separates retrieval failures from reasoning failures.

**4. Refusal rate on out-of-scope queries** — the system must refuse questions outside T&E policy scope (e.g., HR questions, contractor policy). A system that answers everything confidently is more dangerous than one that refuses. Measured as: did the system correctly return `refused: true` on questions with no relevant policy grounding?

**5. Confidence calibration** — high-confidence verdicts should be more accurate than low-confidence ones. If they're not, the confidence score is meaningless to a reviewer deciding when to trust the AI vs. manually review. Split into high (>0.7) and low (≤0.7) buckets.

Current scores (4 verdict test cases + 2 refusal cases):

```
Verdict Accuracy:            4/4  (100%)
Citation Faithfulness:       5/5  (100%) — 3 exact L1, 2 fuzzy L2, 0 failed
Retrieval Precision@5:       4/4  (100%)
Refusal Rate (out-of-scope): 2/2  (100%)
Confidence Calibration:      100% at both high and low confidence
```

---

## Scaling to 10K Submissions/Day

Current architecture processes receipts synchronously (~3–8s per receipt). At 10K/day peak:

1. **Async job queue** — Move extraction + retrieval + verdict into ARQ workers. Upload returns 202 + job ID; frontend polls status.
2. **Horizontal FastAPI workers** — Stateless; run multiple uvicorn replicas behind a load balancer.
3. **pgvector → Pinecone** — At ~1M+ chunks or high-QPS search, swap `retrieval.py`. Everything else unchanged.
4. **R2 file storage** — Already abstracted behind `StorageService`; flip `STORAGE_BACKEND=r2` in `.env`.
5. **PgBouncer** — Connection pooling in front of Postgres.

---

## What I'd Do Next

- **Topic classifier on Policy Q&A** — small fine-tuned classifier to explicitly reject non-T&E questions before retrieval
- **Multi-receipt cross-checks** — flag when total across all receipts in a submission exceeds the per-trip cap
- **Feedback loop** — log (receipt, policy_chunks, ai_verdict, human_verdict) tuples for few-shot prompt improvement
- **PDF preview in UI** — embed streamed file in an iframe on the receipt detail
- **Webhook on verdict** — notify the submitting employee via email when reviewed
- **Better prompt versioning** — A/B test prompt versions and track accuracy per version in the eval harness
