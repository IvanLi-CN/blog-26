import { formatRuntimeValue, getRuntimeValueCandidates } from "../../lib/runtime-format";

interface Props {
  value: number;
  className?: string;
  format?: "compact" | "fixed-2";
}
export default function RuntimeMetricValue(props: Props) {
  const { value, className = "", format = "compact" } = props;
  const fullValue = format === "fixed-2" ? value.toFixed(2) : formatRuntimeValue(value);
  const candidates = format === "fixed-2" ? [fullValue] : getRuntimeValueCandidates(value);
  const initialValue = candidates[0] ?? fullValue;
  return (
    <>
      <strong
        className={`runtime-metric-value ${className}`.trim()}
        data-runtime-value=""
        data-runtime-value-full={fullValue}
        data-runtime-value-options={JSON.stringify(candidates)}
        data-runtime-value-truncated="false"
        aria-label={fullValue}
        role="img"
        tabIndex={-1}
      >
        {initialValue}
      </strong>
      <span
        className="runtime-value-tooltip"
        data-runtime-value-tooltip=""
        role="tooltip"
        hidden
      ></span>
    </>
  );
}
