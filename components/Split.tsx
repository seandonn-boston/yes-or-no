import type { Shown } from "@/lib/access";

const n = (x: number) => x.toLocaleString("en-US");

// The true/false split: two figures and a bar. Per-answer counts and the total appear only
// when `shown` carries them (see lib/access.ts).
export function Split({ shown, reveal = false }: { shown: Shown; reveal?: boolean }) {
  const { split, sides, totalLabel } = shown;
  if (!split) return null;
  if (!shown.hasVotes) return <p className="q-hint">No votes yet. Yours would be the first.</p>;

  const segments = (["true", "false", "unsure"] as const).filter((k) => split[k] > 0);
  const description = `True ${split.true}%, false ${split.false}%, unsure ${split.unsure}%`;
  return (
    <div className={`split${reveal ? " split-reveal" : ""}`}>
      <div className="split-figures">
        <p className="fig">
          <span className="fig-pct">{split.true}%</span>
          <span className="fig-label"><i className="swatch true" />True{sides && <em>{n(sides.true)}</em>}</span>
        </p>
        <p className="fig fig-right">
          <span className="fig-pct">{split.false}%</span>
          <span className="fig-label"><i className="swatch false" />False{sides && <em>{n(sides.false)}</em>}</span>
        </p>
      </div>
      <div className="split-bar" role="img" aria-label={description}>
        {segments.map((k) => <span key={k} className={`seg ${k}`} style={{ flexGrow: split[k] }} />)}
      </div>
      <p className="split-foot">
        <span><i className="swatch unsure" />Unsure {split.unsure}%{sides && <em>{n(sides.unsure)}</em>}</span>
        {totalLabel && <span>{totalLabel}</span>}
      </p>
    </div>
  );
}
