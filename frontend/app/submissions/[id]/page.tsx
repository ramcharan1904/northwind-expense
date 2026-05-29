"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type Submission, type Employee, type Receipt, type Verdict } from "@/lib/api";
import { VerdictCard } from "@/components/VerdictCard";
import { VerdictBadge } from "@/components/VerdictBadge";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  reviewed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [verdictMap, setVerdictMap] = useState<Record<string, Verdict[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sub, emps, verd] = await Promise.all([
        api.submissions.get(id),
        api.employees.list(),
        api.verdicts.list(id),
      ]);
      setSubmission(sub);
      setEmployee(emps.find((e) => e.id === sub.employee_id) || null);

      const grouped: Record<string, Verdict[]> = {};
      for (const v of verd) {
        if (!grouped[v.receipt_id]) grouped[v.receipt_id] = [];
        grouped[v.receipt_id].push(v);
      }
      setVerdictMap(grouped);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function advanceStatus(newStatus: string) {
    if (!submission) return;
    setAdvancing(true);
    setError("");
    try {
      const updated = await api.submissions.updateStatus(id, newStatus);
      setSubmission(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-gray-100 rounded w-40" />
      <div className="card p-6 space-y-3">
        <div className="h-5 bg-gray-100 rounded w-1/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded w-2/5" />
      </div>
    </div>
  );

  if (error && !submission) return (
    <div className="card p-8 text-center">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );

  if (!submission) return null;

  const allCurrentVerdicts = Object.values(verdictMap).flat().map((v) => v.current_verdict);
  const hasRejected  = allCurrentVerdicts.some((v) => v === "rejected");
  const hasAmbiguous = allCurrentVerdicts.some((v) => v === "ambiguous");
  const canApprove   = allCurrentVerdicts.length > 0 && !hasRejected && !hasAmbiguous;
  const showReviewerActions = submission.status === "reviewed";

  const approveBlockReason = hasRejected
    ? "One or more receipts are rejected — override them first"
    : hasAmbiguous
    ? "One or more receipts are ambiguous — override them first"
    : "";

  const totalReceipts = Object.keys(verdictMap).length;
  const verdictCounts = allCurrentVerdicts.reduce<Record<string, number>>((acc, v) => {
    acc[v] = (acc[v] || 0) + 1; return acc;
  }, {});

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 mb-6 text-sm">
        <Link href="/submissions" className="text-gray-400 hover:text-gray-600 transition-colors">Submissions</Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-700 font-medium">{submission.destination || id.slice(0, 8)}</span>
      </nav>

      {/* Submission header card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
              {employee?.name?.charAt(0) ?? "?"}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">
                  {employee ? employee.name : "Unknown Employee"}
                </h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLES[submission.status]}`}>
                  {submission.status}
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {employee && (
                  <p className="text-sm text-gray-500">
                    {employee.employee_ref}
                    {employee.grade && ` · Grade ${employee.grade}`}
                    {employee.title && ` · ${employee.title}`}
                    {employee.department && ` · ${employee.department}`}
                  </p>
                )}
                {submission.trip_purpose && <p className="text-sm text-gray-600">{submission.trip_purpose}</p>}
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {submission.destination && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {submission.destination}
                    </span>
                  )}
                  {submission.trip_start && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {submission.trip_start}{submission.trip_end ? ` → ${submission.trip_end}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {submission.status === "draft" && (
              <button onClick={() => advanceStatus("pending")} disabled={advancing} className="btn-primary">
                Submit for Review
              </button>
            )}
            {showReviewerActions && (
              <>
                <div className="relative group">
                  <button
                    onClick={() => canApprove && advanceStatus("approved")}
                    disabled={advancing || !canApprove}
                    className={`btn-success ${!canApprove ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Approve
                  </button>
                  {!canApprove && (
                    <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 hidden group-hover:block z-10 shadow-lg">
                      {approveBlockReason}
                    </div>
                  )}
                </div>
                <button onClick={() => advanceStatus("rejected")} disabled={advancing} className="btn-danger">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {/* Verdict summary row */}
        {totalReceipts > 0 && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            <span className="text-xs text-gray-400">{totalReceipts} receipt{totalReceipts !== 1 ? "s" : ""}</span>
            {Object.entries(verdictCounts).map(([v, count]) => (
              <span key={v} className="flex items-center gap-1.5">
                <VerdictBadge verdict={v} />
                <span className="text-xs text-gray-500">×{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Receipts section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Receipts &amp; AI Verdicts</h2>
        <Link href={`/submissions/${id}/upload`} className="btn-secondary text-xs py-1.5 px-3">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload Receipt
        </Link>
      </div>

      {Object.keys(verdictMap).length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No receipts uploaded yet</p>
          <p className="text-xs text-gray-400 mb-4">Upload a receipt to start the AI review</p>
          <Link href={`/submissions/${id}/upload`} className="btn-primary inline-flex">
            Upload First Receipt
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(verdictMap).map(([receiptId, verdicts], idx) => (
            <div key={receiptId}>
              <p className="text-xs text-gray-400 font-medium mb-2">
                Receipt {idx + 1}
                <span className="font-mono text-gray-300 ml-1.5">{receiptId.slice(0, 8)}…</span>
              </p>
              <div className="space-y-3">
                {verdicts.map((v) => (
                  <VerdictCard key={v.id} verdict={v} onOverrideCreated={load} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
