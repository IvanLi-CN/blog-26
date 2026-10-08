import type { RuntimeStat } from "../../lib/project-runtime-metrics";
import "uplot/dist/uPlot.min.css";

interface Props {
  label: string;
  stat: RuntimeStat;
  tone?: "accent" | "secondary" | "warm";
  variant?: "line" | "bars";
  placement?: "full" | "right";
}
export default function RuntimeSparkline(props: Props) {
  const { label, stat, tone = "accent", variant = "line", placement = "full" } = props;
  const trendData = JSON.stringify(stat.trend);
  const futurePointCount = stat.trend.points.filter((point) => point.value === null).length;
  return (
    <div
      className={`runtime-sparkline runtime-sparkline--${tone} runtime-sparkline--${variant}`}
      data-runtime-sparkline=""
      data-runtime-trend={trendData}
      data-runtime-range={stat.trend.range}
      data-runtime-point-count={stat.trend.points.length}
      data-runtime-future-count={futurePointCount}
      data-runtime-chart-variant={variant}
      data-runtime-chart-mode={variant === "bars" ? "bars" : "area"}
      data-runtime-chart-placement={placement}
      role="img"
      aria-label={`${label}${variant === "bars" ? "柱状趋势图" : "面积趋势图"}，${stat.trend.range === "today" ? "今日" : "最近几小时"}`}
    ></div>
  );
}
