import type { Options } from "highcharts";
import type { GroupStat, QuestionStats } from "./stats";

// Answer colours. They only ever mean an answer, in charts and in the interface alike
// (the same values live in app/globals.css as --true, --false and --unsure).
export const COLORS = { true: "#2196e8", false: "#dd6f17", unsure: "#6b7480" } as const;

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Share answering true / false / unsure on each of the last 14 days.
export function trendChart(history: QuestionStats["history"]): Options {
  const value = (pick: (h: QuestionStats["history"][number]) => number) =>
    history.map((h) => (h.total > 0 ? pick(h) : null));
  // Name each line at its right-hand end so identity never rests on colour alone.
  const labelled = (name: string, data: (number | null)[]) =>
    data.map((y, i) =>
      i === data.length - 1 && y !== null
        ? { y, dataLabels: { enabled: true, format: name, align: "right" as const, y: -6 } }
        : y,
    );
  const t = value((h) => h.pctTrue), f = value((h) => h.pctFalse), u = value((h) => h.pctUnsure);
  return {
    chart: { type: "line", height: 240 },
    xAxis: { categories: history.map((h) => dayLabel(h.day)), tickInterval: 3, crosshair: true },
    yAxis: {
      min: 0, max: 100, tickInterval: 25,
      labels: { format: "{value}%" },
      plotLines: [{ value: 50, dashStyle: "Dash", width: 1, zIndex: 1 }],
    },
    tooltip: { shared: true, valueSuffix: "%" },
    plotOptions: { series: { connectNulls: true, marker: { enabled: false } } },
    series: [
      { type: "line", name: "True", color: COLORS.true, data: labelled("True", t) },
      { type: "line", name: "False", color: COLORS.false, data: labelled("False", f) },
      { type: "line", name: "Unsure", color: COLORS.unsure, dashStyle: "ShortDash", data: labelled("Unsure", u) },
    ],
  };
}

// The same question, answered with and without a name attached.
export function visibilityChart(pub: NonNullable<GroupStat>, priv: NonNullable<GroupStat>): Options {
  return {
    chart: { type: "bar", height: 170 },
    xAxis: { categories: ["Public", "Private"] },
    yAxis: { min: 0, max: 100, tickInterval: 25, labels: { format: "{value}%" }, reversedStacks: false },
    tooltip: { shared: true, valueSuffix: "%" },
    plotOptions: { bar: { stacking: "normal", pointWidth: 22, borderRadius: 3 } },
    series: [
      { type: "bar", name: "True", color: COLORS.true, data: [pub.pctTrue, priv.pctTrue] },
      { type: "bar", name: "False", color: COLORS.false, data: [pub.pctFalse, priv.pctFalse] },
      { type: "bar", name: "Unsure", color: COLORS.unsure, data: [pub.pctUnsure, priv.pctUnsure] },
    ],
  };
}

// How first votes arrived. One series, so no legend; the title carries the meaning.
export function arrivalChart(sources: { label: string; votes: number }[]): Options {
  return {
    chart: { type: "bar", height: 44 + sources.length * 34 },
    xAxis: { categories: sources.map((s) => s.label) },
    yAxis: { min: 0, labels: { enabled: false }, gridLineWidth: 0 },
    legend: { enabled: false },
    tooltip: { pointFormat: "<b>{point.y:,.0f}</b> first votes" },
    plotOptions: { bar: { pointWidth: 14, borderRadius: 3, dataLabels: { enabled: true, format: "{point.y:,.0f}" } } },
    series: [{ type: "bar", name: "First votes", color: "#c3c9d3", data: sources.map((s) => s.votes) }],
  };
}
