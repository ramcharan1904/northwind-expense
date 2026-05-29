type Verdict = "compliant" | "flagged" | "rejected" | "ambiguous";

const STYLES: Record<Verdict, string> = {
  compliant: "bg-green-100 text-green-800 border border-green-300",
  flagged:   "bg-amber-100 text-amber-800 border border-amber-300",
  rejected:  "bg-red-100 text-red-800 border border-red-300",
  ambiguous: "bg-gray-100 text-gray-700 border border-gray-300",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict as Verdict;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STYLES[v] ?? STYLES.ambiguous}`}>
      {verdict.toUpperCase()}
    </span>
  );
}
