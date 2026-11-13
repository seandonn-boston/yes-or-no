"use client";

import { useEffect, useRef } from "react";
import type { Chart as HighchartsChart, Options } from "highcharts";

const INK = "#eef1f6";
const DIM = "#99a1ae";
const LINE = "#23262c";

// House style for every chart: true black, hairline grid, thin marks, text in ink rather
// than series colours.
const THEME: Options = {
  chart: {
    backgroundColor: "transparent",
    spacing: [8, 4, 26, 4],   // room under the axis for the Highcharts credit
    style: { fontFamily: "inherit" },
    animation: false,
  },
  title: { text: undefined },
  credits: { style: { color: "#565c66", fontSize: "9px" }, position: { y: -4 } },
  legend: {
    align: "left", verticalAlign: "top", margin: 14, padding: 0, symbolRadius: 2,
    itemStyle: { color: INK, fontWeight: "500", fontSize: "13px" },
    itemHoverStyle: { color: "#ffffff" },
    itemHiddenStyle: { color: "#565c66" },
  },
  xAxis: {
    lineColor: LINE, tickColor: LINE,
    labels: { style: { color: DIM, fontSize: "12px" } },
    crosshair: { color: "#3a3f47", width: 1 },
  },
  yAxis: {
    title: { text: undefined },
    gridLineColor: "#16181c",
    labels: { style: { color: DIM, fontSize: "12px" } },
    plotLines: [],
  },
  tooltip: {
    backgroundColor: "#0b0c0e", borderColor: "#3a3f47", borderRadius: 4, shadow: false,
    style: { color: INK, fontSize: "13px" },
  },
  plotOptions: {
    series: {
      animation: false,
      borderColor: "#000000", borderWidth: 2,   // a 2px gap of surface between adjacent fills
      lineWidth: 2,
      states: { inactive: { opacity: 0.35 } },
      dataLabels: { style: { color: INK, fontSize: "12px", fontWeight: "600", textOutline: "none" } },
    },
  },
};

type Props = { options: Options; label: string };

export function Chart({ options, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(options);

  useEffect(() => {
    let chart: HighchartsChart | undefined;
    let cancelled = false;
    import("highcharts").then((mod) => {
      if (cancelled || !ref.current) return;
      const Highcharts = mod.default ?? mod;
      const parsed = JSON.parse(key) as Options;
      // The reference line on the value axis takes its colour from the theme.
      const yAxis = parsed.yAxis && !Array.isArray(parsed.yAxis) ? parsed.yAxis : undefined;
      yAxis?.plotLines?.forEach((line) => { line.color ??= "#3a3f47"; });
      chart = Highcharts.chart(ref.current, Highcharts.merge(THEME, parsed));
    });
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [key]);

  const height = typeof options.chart?.height === "number" ? options.chart.height : 240;
  return <div ref={ref} className="chart" style={{ height }} role="img" aria-label={label} />;
}
