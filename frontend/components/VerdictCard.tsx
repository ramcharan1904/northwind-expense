"use client";
import { useState } from "react";
import type { Verdict } from "@/lib/api";
import { VerdictBadge } from "./VerdictBadge";
import { OverridePanel } from "./OverridePanel";
import { api } from "@/lib/api";

const CARD_BORDER: Record<string, string> = {
  compliant: "border-l-4 border-l-green-400",
  flagged:   "border-l-4 border-l-amber-400",
  rejected:  "border-l-4 border-l-red-500",
  ambiguous: "border-l-4 border-l-gray-300",
};

export function VerdictCard({
  verdict,
  onOverrideCreated,
}: {
  verdict: Verdict;
  onOverrideCreated?: () => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  const currentVerdict = verdict.current_verdict || verdict.verdict;
  const borderClass = CARD_BORDER[currentVerdict] || CARD_BORDER.ambiguous;

  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${borderClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <VerdictBadge verdict={currentVerdict} />
            {verdict.is_overridden && (
              <span className="text-xs text-gray-500 italic">
                (overridden from {verdict.verdict})
              </span>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              Confidence: {(Number(verdict.confidence) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Confidence bar */}
          <div className="h-1.5 bg-gray-100 rounded-full mb-3">
            <div
              className="h-1.5 rounded-full bg-blue-500"
              style={{ width: `${Number(verdict.confidence) * 100}%` }}
            />
          </div>

          <p className="text-sm text-gray-700 whitespace-pre-wrap">{verdict.reasoning}</p>

          {verdict.citations.length > 0 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              {showCitations ? "Hide" : "Show"} {verdict.citations.length} citation(s)
            </button>
          )}

          {showCitations && (
            <div className="mt-2 space-y-2">
              {verdict.citations.map((c) => (
                <div key={c.id} className="bg-gray-50 rounded p-2 text-xs border border-gray-200">
                  <div className="font-semibold text-gray-600">
                    {c.doc_id} {c.section} {c.quote_verbatim ? "✓" : "≈"}
                  </div>
                  <blockquote className="text-gray-700 italic mt-1">&ldquo;{c.quoted_text}&rdquo;</blockquote>
                </div>
              ))}
            </div>
          )}

          {verdict.is_overridden && verdict.overrides.length > 0 && (
            <div className="mt-2 text-xs bg-blue-50 rounded p-2 border border-blue-200">
              <span className="font-semibold">Override by {verdict.overrides[0].reviewer_name || verdict.overrides[0].reviewer_email}:</span>{" "}
              {verdict.overrides[0].comment}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowOverride(!showOverride)}
          className="shrink-0 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
        >
          Override
        </button>
      </div>

      {showOverride && (
        <OverridePanel
          verdictId={verdict.id}
          currentVerdict={currentVerdict}
          onSuccess={() => {
            setShowOverride(false);
            onOverrideCreated?.();
          }}
          onCancel={() => setShowOverride(false)}
        />
      )}
    </div>
  );
}
