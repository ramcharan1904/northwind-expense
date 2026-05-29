-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMs
CREATE TYPE file_type_enum AS ENUM ('pdf', 'jpg', 'png', 'txt');
CREATE TYPE verdict_enum AS ENUM ('compliant', 'flagged', 'rejected', 'ambiguous');
CREATE TYPE submission_status_enum AS ENUM ('draft', 'pending', 'reviewed', 'approved', 'rejected');

-- 1. employees
CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_ref    TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT,
    grade           INTEGER NOT NULL,
    title           TEXT,
    department      TEXT,
    manager_ref     TEXT,
    home_base       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. submissions
CREATE TABLE submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    trip_purpose    TEXT,
    trip_start      DATE,
    trip_end        DATE,
    destination     TEXT,
    status          submission_status_enum NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submissions_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. receipts
CREATE TABLE receipts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id       UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    file_name           TEXT NOT NULL,
    file_path           TEXT NOT NULL,           -- relative path (not a URL)
    file_type           file_type_enum NOT NULL,
    raw_text            TEXT,
    extraction_method   TEXT,                    -- 'pymupdf' | 'claude_vision' | 'plaintext'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. receipt_extractions
CREATE TABLE receipt_extractions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id              UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    amount                  NUMERIC(12, 2),
    currency                TEXT,
    vendor                  TEXT,
    category                TEXT,
    expense_date            DATE,
    description             TEXT,
    extraction_confidence   NUMERIC(4, 3),
    extracted_json          JSONB,
    model_used              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. verdicts  (NEVER update after creation)
CREATE TABLE verdicts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id      UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    verdict         verdict_enum NOT NULL,
    confidence      NUMERIC(4, 3) NOT NULL,
    reasoning       TEXT NOT NULL,
    model_used      TEXT,
    prompt_version  TEXT,
    retrieval_score NUMERIC(4, 3),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. verdict_citations
CREATE TABLE verdict_citations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verdict_id          UUID NOT NULL REFERENCES verdicts(id) ON DELETE CASCADE,
    policy_chunk_id     UUID,                    -- FK set after lookup; nullable if chunk deleted
    doc_id              TEXT NOT NULL,
    section             TEXT,
    quoted_text         TEXT NOT NULL,
    relevance_score     NUMERIC(4, 3),
    quote_verbatim      BOOLEAN NOT NULL DEFAULT FALSE,
    semantic_support    NUMERIC(4, 3),           -- cosine sim 0.0–1.0, NULL if L1/L2 validated or failed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. overrides  (APPEND-ONLY — enforced at DB level)
CREATE TABLE overrides (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verdict_id          UUID NOT NULL REFERENCES verdicts(id) ON DELETE RESTRICT,
    original_verdict    verdict_enum NOT NULL,
    new_verdict         verdict_enum NOT NULL,
    reviewer_email      TEXT NOT NULL,
    reviewer_name       TEXT,
    comment             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DB-level append-only enforcement — application bugs cannot corrupt the audit trail
CREATE RULE no_update_overrides AS ON UPDATE TO overrides DO INSTEAD NOTHING;
CREATE RULE no_delete_overrides AS ON DELETE TO overrides DO INSTEAD NOTHING;

-- 8. policy_documents
CREATE TABLE policy_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          TEXT UNIQUE NOT NULL,
    title           TEXT,
    version         TEXT,
    effective_date  DATE,
    file_name       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. policy_chunks  (RAG knowledge base)
CREATE TABLE policy_chunks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_document_id  UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
    doc_id              TEXT NOT NULL,
    section             TEXT,
    page_number         INTEGER,
    content             TEXT NOT NULL,
    embedding           vector(1536),
    token_count         INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ivfflat index built AFTER bulk insert (see policy_ingestion.py)
-- CREATE INDEX policy_chunks_embedding_idx
--     ON policy_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for common query patterns
CREATE INDEX idx_submissions_employee_id ON submissions(employee_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_receipts_submission_id ON receipts(submission_id);
CREATE INDEX idx_verdicts_receipt_id ON verdicts(receipt_id);
CREATE INDEX idx_verdicts_submission_id ON verdicts(submission_id);
CREATE INDEX idx_verdict_citations_verdict_id ON verdict_citations(verdict_id);
CREATE INDEX idx_overrides_verdict_id ON overrides(verdict_id);
CREATE INDEX idx_policy_chunks_doc_id ON policy_chunks(doc_id);
