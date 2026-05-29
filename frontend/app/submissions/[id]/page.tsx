"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type Submission, type Employee, type Receipt, type Verdict } from "@/lib/api";
import { VerdictCard } from "@/components/VerdictCard";

const STATUS_STYLES: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-yellow-100 text-yellow-700",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const NEXT_STATUS: Record<string, string | null> = {
  draft:    "pending",
  reviewed: null,
  approved: null,
  rejected: null,
  pending:  null,
};

const REVIEWER_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  reviewed: [
    { label: "Approve", status: "approved", color: "bg-green-600 hover:bg-green-700" },
    { label: "Reject",  status: "rejected",  color: "bg-red-600 hover:bg-red-700"  },
  ],
};

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
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
      const emp = emps.find((e) => e.id === sub.employee_id);
      setEmployee(emp || null);

      const grouped: Record<string, Verdict[]> = {};
      for (const v of verd) {
        if (!grouped[v.receipt_id]) grouped[v.receipt_id] = [];
        grouped[v.receipt_id].push(v);
      }
      setVerdictMap(grouped);

      const allVerdictReceiptIds = new Set(verd.map((v) => v.receipt_id));
      const uniqueReceiptIds = [...allVerdictReceiptIds];
      if (uniqueReceiptIds.length > 0) {
        setReceipts(uniqueReceiptIds.map((rid) => ({ id: rid } as Receipt)));
      }
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
    try {
      const updated = await api.submissions.updateStatus(id, newStatus);
      setSubmission(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!submission) return null;

  const canSubmit = submission.status === "draft";
  const showReviewerActions = submission.status === "reviewed";

  const allCurrentVerdicts = Object.values(verdictMap).flat().map((v) => v.current_verdict);
  const hasRejected  = allCurrentVerdicts.some((v) => v === "rejected");
  const hasAmbiguous = allCurrentVerdicts.some((v) => v === "ambiguous");
  const canApprove   = allCurrentVerdicts.length > 0 && !hasRejected && !hasAmbiguous;

  const approveBlockReason = hasRejected
    ? "Cannot approve: one or more receipts are rejected"
    : hasAmbiguous
    ? "Cannot approve: one or more receipts are ambiguous — override them first"
    : "";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
        <Link href="/submissions" className="hover:text-blue-600">Submissions</Link>
        <span>/</span>
        <span className="text-gray-700">{submission.destination || submission.id.slice(0, 8)}</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              {employee ? `${employee.name}` : "Unknown Employee"}
            </h1>
            <div className="text-sm text-gray-500 mt-1 space-y-0.5">
              {employee && (
                <div>{employee.employee_ref} · Grade {employee.grade} · {employee.title}</div>
              )}
              {submission.trip_purpose && <div>Purpose: {submission.trip_purpose}</div>}
              {submission.destination && <div>Destination: {submission.destination}</div>}
              {submission.trip_start && (
                <div>Dates: {submission.trip_start}{submission.trip_end ? ` → ${submission.trip_end}` : ""}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[submission.status]}`}>
              {submission.status}
            </span>

            {canSubmit && (
              <button
                onClick={() => advanceStatus("pending")}
                disabled={advancing}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Submit for Review
              </button>
            )}

            {showReviewerActions && (
              <>
                <div className="relative group">
                  <button
                    onClick={() => canApprove && advanceStatus("approved")}
                    disabled={advancing || !canApprove}
                    className={`text-sm px-3 py-1.5 text-white rounded transition-opacity
                      ${canApprove
                        ? "bg-green-600 hover:bg-green-700 cursor-pointer"
                        : "bg-green-600 opacity-40 cursor-not-allowed"}`}
                  >
                    Approve
                  </button>
                  {!canApprove && (
                    <div className="absolute bottom-full right-0 mb-1 w-64 bg-gray-800 text-white text-xs rounded px-2 py-1.5 hidden group-hover:block z-10 text-left">
                      {approveBlockReason}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => advanceStatus("rejected")}
                  disabled={advancing}
                  className="text-sm px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Receipts & AI Verdicts</h2>
        <Link
          href={`/submissions/${id}/upload`}
          className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
        >
          + Upload Receipt
        </Link>
      </div>

      {Object.keys(verdictMap).length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-500">
          No receipts uploaded yet.{" "}
          <Link href={`/submissions/${id}/upload`} className="text-blue-600 hover:underline">
            Upload the first receipt
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(verdictMap).map(([receiptId, verdicts]) => (
          <div key={receiptId}>
            <div className="text-xs text-gray-400 mb-1 font-mono">receipt: {receiptId.slice(0, 8)}…</div>
            <div className="space-y-2">
              {verdicts.map((v) => (
                <VerdictCard
                  key={v.id}
                  verdict={v}
                  onOverrideCreated={load}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
