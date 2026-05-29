"use client";
import { useState } from "react";
import type { Verdict } from "@/lib/api";
import { VerdictBadge } from "./VerdictBadge";
import { OverridePanel } from "./OverridePanel";

const CARD_ACCENT: Record<string, string> = {
  compliant: "border-l-emerald-400",
  flagged:   "border-l-amber-400",
  rejected:  "border-l-red-500",
  ambiguous: "border-l-gray-300",
};

const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.8 ? "bg-emerald-500" : c >= 0.5 ? "bg-amber-400" : "bg-red-400";

export function VerdictCard({
  verdict,
  receiptName,
  onOverrideCreated,
}: {
  verdict: Verdict;
  receiptName?: string;
  onOverrideCreated?: () => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  const currentVerdict = verdict.current_verdict || verdict.verdict;
  const confidence = Number(verdict.confidence);
  const accentClass = CARD_ACCENT[currentVerdict] ?? CARD_ACCENT.ambiguous;

  return (
    <div className={`card border-l-4 ${accentClass} overflow-hidden`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <VerdictBadge verdict={currentVerdict} size="md" />
            {verdict.is_overridden && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                overridden from <VerdictBadge verdict={verdict.verdict} />
              </span>
            )}
          </div>
          <button
            onClick={() => setShowOverride(!showOverride)}
            className="shrink-0 btn-secondary text-xs py-1.5 px-3"
          >
            {showOverride ? "Cancel" : "Override"}
          </button>
        </div>

        {/* Confidence bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Confidence</span>
            <span className="text-xs font-semibold text-gray-700">{(confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${CONFIDENCE_COLOR(confidence)}`}
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
        </div>

        {/* Reasoning */}
        <div className="bg-gray-50 rounded-lg p-3.5 mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">AI Reasoning</p>
          <p className="text-sm text-gray-700 leading-relaxed">{verdict.reasoning}</p>
        </div>

        {/* Citations toggle */}
        {verdict.citations.length > 0 && (
          <button
            onClick={() => setShowCitations(!showCitations)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showCitations ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {verdict.citations.length} policy citation{verdict.citations.length !== 1 ? "s" : ""}
          </button>
        )}

        {/* Citations */}
        {showCitations && (
          <div className="mt-3 space-y-2">
            {verdict.citations.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-100 bg-white p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-gray-700">{c.doc_id}</span>
                  {c.section && <span className="text-xs text-gray-400">{c.section}</span>}
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-medium ${
                    c.quote_verbatim
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-50 text-gray-500"
                  }`}>
                    {c.quote_verbatim ? "Exact match" : "Semantic match"}
                  </span>
                </div>
                <blockquote className="text-xs text-gray-600 italic border-l-2 border-gray-200 pl-2.5">
                  &ldquo;{c.quoted_text}&rdquo;
                </blockquote>
              </div>
            ))}
          </div>
        )}

        {/* Override note */}
        {verdict.is_overridden && verdict.overrides.length > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
            <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div className="text-xs text-blue-800">
              <span className="font-semibold">
                {verdict.overrides[0].reviewer_name || verdict.overrides[0].reviewer_email}
              </span>
              {": "}
              {verdict.overrides[0].comment}
            </div>
          </div>
        )}
      </div>

      {/* Override panel */}
      {showOverride && (
        <div className="px-5 pb-5">
          <OverridePanel
            verdictId={verdict.id}
            currentVerdict={currentVerdict}
            onSuccess={() => {
              setShowOverride(false);
              onOverrideCreated?.();
            }}
            onCancel={() => setShowOverride(false)}
          />
        </div>
      )}
    </div>
  );
}
