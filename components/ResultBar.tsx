import { percentages, type Tally } from "@/lib/stats";

// Percentages for everyone; head counts only when `showCounts` is set (account holders).
export function ResultBar({ tally, showCounts }: { tally: Tally; showCounts: boolean }) {
  if (!tally.total) return <p className="muted">No votes yet.</p>;
  const p = percentages(tally);
  const rows = [
    { key: "true", label: "True", pct: p.true, n: tally.true },
    { key: "false", label: "False", pct: p.false, n: tally.false },
    { key: "unsure", label: "Unsure", pct: p.unsure, n: tally.unsure },
  ];
  return (
    <div className="results">
      <div className="bar" role="img" aria-label={rows.map((r) => `${r.label} ${r.pct}%`).join(", ")}>
        {rows.map((r) => r.pct > 0 && <span key={r.key} className={`seg ${r.key}`} style={{ width: `${r.pct}%` }} />)}
      </div>
      <ul className="legend">
        {rows.map((r) => (
          <li key={r.key}>
            <span className={`dot ${r.key}`} />
            {r.label} <strong>{r.pct}%</strong>
            {showCounts && <span className="muted"> ({r.n.toLocaleString("en-US")})</span>}
          </li>
        ))}
      </ul>
      {showCounts && <p className="muted small">{tally.total.toLocaleString("en-US")} votes</p>}
    </div>
  );
}
