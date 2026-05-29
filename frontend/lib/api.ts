const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type Employee = {
  id: string;
  employee_ref: string;
  name: string;
  grade: number;
  title: string | null;
  department: string | null;
  home_base: string | null;
};

export type Submission = {
  id: string;
  employee_id: string;
  trip_purpose: string | null;
  trip_start: string | null;
  trip_end: string | null;
  destination: string | null;
  status: "draft" | "pending" | "reviewed" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

export type Receipt = {
  id: string;
  submission_id: string;
  file_name: string;
  file_type: string;
  extraction_method: string | null;
  extraction: {
    amount: number | null;
    currency: string | null;
    vendor: string | null;
    category: string | null;
    expense_date: string | null;
    description: string | null;
    extraction_confidence: number | null;
  } | null;
};

export type VerdictCitation = {
  id: string;
  doc_id: string;
  section: string | null;
  quoted_text: string;
  relevance_score: number | null;
  quote_verbatim: boolean;
  semantic_support: number | null;
};

export type Verdict = {
  id: string;
  receipt_id: string;
  verdict: "compliant" | "flagged" | "rejected" | "ambiguous";
  current_verdict: "compliant" | "flagged" | "rejected" | "ambiguous";
  confidence: number;
  reasoning: string;
  retrieval_score: number | null;
  is_overridden: boolean;
  citations: VerdictCitation[];
  overrides: Array<{
    id: string;
    original_verdict: string;
    new_verdict: string;
    reviewer_email: string;
    reviewer_name: string | null;
    comment: string;
    created_at: string;
  }>;
};

export type PolicyQAResponse = {
  answer: string;
  citations: Array<{
    doc_id: string;
    section: string | null;
    quoted_text: string;
    similarity_score: number;
  }>;
  refused: boolean;
  refusal_reason: string | null;
  top_similarity: number | null;
};

// ── API functions ──────────────────────────────────────────────────────────

export const api = {
  employees: {
    list: () => apiFetch<Employee[]>("/api/employees"),
    create: (body: {
      employee_ref: string;
      name: string;
      grade: number;
      email?: string;
      title?: string;
      department?: string;
      home_base?: string;
    }) => apiFetch<Employee>("/api/employees", { method: "POST", body: JSON.stringify(body) }),
  },

  submissions: {
    list: (params?: { employee_id?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.employee_id) qs.set("employee_id", params.employee_id);
      if (params?.status) qs.set("status", params.status);
      return apiFetch<Submission[]>(`/api/submissions${qs.toString() ? "?" + qs : ""}`);
    },
    get: (id: string) => apiFetch<Submission>(`/api/submissions/${id}`),
    create: (body: {
      employee_id: string;
      trip_purpose?: string;
      trip_start?: string;
      trip_end?: string;
      destination?: string;
    }) => apiFetch<Submission>("/api/submissions", { method: "POST", body: JSON.stringify(body) }),
    updateStatus: (id: string, status: string) =>
      apiFetch<Submission>(`/api/submissions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },

  receipts: {
    upload: async (submissionId: string, file: File): Promise<Receipt> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/submissions/${submissionId}/receipts`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
      return res.json();
    },
    fileUrl: (receiptId: string) => `${API_URL}/api/receipts/${receiptId}/file`,
  },

  verdicts: {
    list: (submissionId: string) =>
      apiFetch<Verdict[]>(`/api/submissions/${submissionId}/verdicts`),
  },

  overrides: {
    create: (
      verdictId: string,
      body: { new_verdict: string; reviewer_email: string; reviewer_name?: string; comment: string }
    ) =>
      apiFetch(`/api/verdicts/${verdictId}/override`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  policyQA: {
    ask: (question: string) =>
      apiFetch<PolicyQAResponse>("/api/policy-qa", {
        method: "POST",
        body: JSON.stringify({ question }),
      }),
  },
};
