"use client";
import { useState } from "react";
import { api } from "@/lib/api";

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
    if (!comment.trim()) { setError("Comment is required"); return; }
    if (!email.trim()) { setError("Reviewer email is required"); return; }
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
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-gray-200 space-y-3">
      <div className="text-sm font-semibold text-gray-700">Override Verdict</div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">New Verdict</label>
        <select
          value={newVerdict}
          onChange={(e) => setNewVerdict(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          {VERDICTS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Your Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="reviewer@example.com"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Comment * (required for all overrides)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required
          rows={3}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          placeholder="Explain why you're overriding this verdict..."
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Override"}
        </button>
      </div>
    </form>
  );
}
