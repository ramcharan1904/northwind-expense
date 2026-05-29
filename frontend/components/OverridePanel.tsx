"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { VerdictBadge } from "./VerdictBadge";

const VERDICTS = ["compliant", "flagged", "rejected", "ambiguous"] as const;

export function OverridePanel({
  verdictId,
  currentVerdict,
  onSuccess,
  onCancel,
}: {
  verdictId: string;
  currentVerdict: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [newVerdict, setNewVerdict] = useState(currentVerdict);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) { setError("A comment is required for all overrides."); return; }
    if (!email.trim())   { setError("Reviewer email is required."); return; }
    setError("");
    setLoading(true);
    try {
      await api.overrides.create(verdictId, {
        new_verdict: newVerdict,
        reviewer_email: email,
        reviewer_name: name || undefined,
        comment,
      });
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Override Verdict</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">New Verdict</label>
          <div className="flex gap-2 flex-wrap">
            {VERDICTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setNewVerdict(v)}
                className={`transition-all ${newVerdict === v ? "ring-2 ring-blue-500 ring-offset-1 rounded-full" : "opacity-60 hover:opacity-90"}`}
              >
                <VerdictBadge verdict={v} size="md" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Your Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder="reviewer@northwind.com"
            />
          </div>
          <div>
            <label className="label">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label className="label">Justification * <span className="normal-case text-gray-400 font-normal">(required — stored in audit log)</span></label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            rows={3}
            className="input resize-none"
            placeholder="Explain why you're overriding this verdict…"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Saving…" : "Save Override"}
          </button>
        </div>
      </form>
    </div>
  );
}
