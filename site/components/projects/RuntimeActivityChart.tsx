import type { RuntimeActivityPoint } from "../../lib/project-runtime-metrics";
import { cssStyle } from "../../lib/react-template";
import { formatRuntimeValue } from "../../lib/runtime-format";

interface Props {
  points: RuntimeActivityPoint[];
  label: string;
  kind: "tokens" | "requests";
}
export default function RuntimeActivityChart(props: Props) {
  const { points, label, kind } = props;
  const maxValue = Math.max(
    ...points.flatMap((point) => (point.value === null ? [] : [point.value])),
    1
  );
  const valueLabel = kind === "tokens" ? "Token" : "请求";
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const parseDate = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const formatDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
  const firstTimestamp = parseDate(points[0]?.date ?? "1970-01-01");
  const lastTimestamp = parseDate(points.at(-1)?.date ?? points[0]?.date ?? "1970-01-01");
  const calendarStart = firstTimestamp - new Date(firstTimestamp).getUTCDay() * dayMilliseconds;
  const calendarEnd = lastTimestamp + (6 - new Date(lastTimestamp).getUTCDay()) * dayMilliseconds;
  const weekCount = Math.floor((calendarEnd - calendarStart) / (7 * dayMilliseconds)) + 1;
  const pointsByDate = new Map(points.map((point) => [point.date, point]));
  const calendarCells = Array.from({ length: weekCount * 7 }, (_, index) => {
    const timestamp = calendarStart + index * dayMilliseconds;
    const date = formatDate(timestamp);
    return {
      date,
      point: pointsByDate.get(date),
      week: Math.floor(index / 7) + 1,
      weekday: (index % 7) + 1,
    };
  });
  return (
    <section className="runtime-activity" data-runtime-chart="" aria-label={label}>
      <h3 className="runtime-chart-title">{label}</h3>
      <div
        className="runtime-activity-grid"
        data-week-count={weekCount}
        data-weekday-count="7"
        style={cssStyle(`--runtime-week-count:${weekCount}`)}
      >
        {calendarCells.map((cell) =>
          cell.point && cell.point.value !== null ? (
            <span
              key={cell.date}
              className="runtime-activity-cell"
              data-runtime-point=""
              data-date={cell.point.date}
              data-value={formatRuntimeValue(cell.point.value)}
              data-label={valueLabel}
              style={cssStyle(
                `--runtime-week:${cell.week};--runtime-weekday:${cell.weekday};--runtime-intensity:${Math.min(cell.point.value / maxValue, 1)}`
              )}
              role="img"
              aria-label={`${cell.point.date} ${valueLabel} ${formatRuntimeValue(cell.point.value)}`}
            ></span>
          ) : (
            <span
              key={cell.date}
              className="runtime-activity-slot runtime-activity-slot--empty"
              style={cssStyle(`--runtime-week:${cell.week};--runtime-weekday:${cell.weekday}`)}
              aria-hidden="true"
            ></span>
          )
        )}
      </div>
      <div className="runtime-chart-tooltip" data-runtime-tooltip="" role="tooltip" hidden></div>
    </section>
  );
}
