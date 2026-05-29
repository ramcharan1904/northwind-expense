type VerdictType = "compliant" | "flagged" | "rejected" | "ambiguous";

const STYLES: Record<VerdictType, string> = {
  compliant: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  flagged:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  rejected:  "bg-red-50 text-red-700 ring-1 ring-red-200",
  ambiguous: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

const ICONS: Record<VerdictType, string> = {
  compliant: "✓",
  flagged:   "⚑",
  rejected:  "✕",
  ambiguous: "?",
};

const LABELS: Record<VerdictType, string> = {
  compliant: "Compliant",
  flagged:   "Flagged",
  rejected:  "Rejected",
  ambiguous: "Ambiguous",
};

export function VerdictBadge({ verdict, size = "sm" }: { verdict: string; size?: "sm" | "md" }) {
  const v = verdict as VerdictType;
  const styles = STYLES[v] ?? STYLES.ambiguous;
  const icon = ICONS[v] ?? "?";
  const label = LABELS[v] ?? verdict;

  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-full ${styles} ${
      size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
    }`}>
      <span>{icon}</span>
      {label}
    </span>
  );
}
