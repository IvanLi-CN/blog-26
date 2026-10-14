import { useLayoutEffect, useRef, useState } from "react";
import {
  fitTechStackChips,
  shouldCollapseTechStackList,
  type TechStackEntry,
  type TechStackNode,
} from "@/lib/playbook/tech-stack";

const chipClassName =
  "block max-w-full truncate rounded-full border border-[rgba(var(--nature-accent-rgb),0.24)] bg-[rgba(var(--nature-accent-rgb),0.1)] px-2 py-0.5 font-mono text-[11px] font-medium leading-4 text-[color:var(--nature-accent-strong)]";

export default function PlaybookTechStackChips({
  entry,
  items,
}: {
  entry: TechStackEntry;
  items: TechStackNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(
    shouldCollapseTechStackList(entry.key, items.length) ? 4 : items.length
  );
  const rowRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<HTMLUListElement>(null);
  const overflowMeasurementsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measurements = measurementsRef.current;
    const overflowMeasurements = overflowMeasurementsRef.current;
    if (!row || !measurements || !overflowMeasurements) return;
    let active = true;
    const measure = () => {
      if (!active || row.clientWidth === 0) return;
      const widths = items.map(
        (_item, index) => measurements.children[index]?.getBoundingClientRect().width ?? 0
      );
      const overflowWidths = Array.from(
        overflowMeasurements.children,
        (item) => item.getBoundingClientRect().width
      );
      const gap = Number.parseFloat(getComputedStyle(measurements).columnGap) || 0;
      setVisibleCount(fitTechStackChips(widths, row.clientWidth, gap, overflowWidths));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(measurements);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [items]);

  const count = Math.min(visibleCount, items.length);
  const remaining = items.length - count;
  const toggleLabel = expanded ? `收起其余 ${remaining} 项` : `展开其余 ${remaining} 项`;
  const overflowId = `tech-stack-list-${entry.key}`;
  const renderItem = (item: TechStackNode, index: number) => (
    <li key={`${entry.key}-${index}`} className="min-w-0 max-w-full shrink">
      <span className={chipClassName} title={item.kind === "scalar" ? String(item.value) : ""}>
        {item.kind === "scalar" ? String(item.value) : ""}
      </span>
    </li>
  );

  return (
    <div ref={rowRef} className="relative min-w-0" data-tech-stack-chip-row>
      <ul
        id={overflowId}
        className={`flex min-w-0 items-start gap-1.5 ${expanded ? "flex-wrap" : "flex-nowrap"}`}
      >
        {(expanded ? items : items.slice(0, count)).map(renderItem)}
        {remaining > 0 ? (
          <li className="shrink-0">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={overflowId}
              aria-label={toggleLabel}
              title={toggleLabel}
              onClick={() => setExpanded(!expanded)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 500,
                lineHeight: "1rem",
              }}
              className={`${chipClassName} transition-colors hover:bg-[rgba(var(--nature-accent-rgb),0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent)]`}
            >
              {expanded ? `−${remaining}` : `+${remaining}`}
            </button>
          </li>
        ) : null}
      </ul>
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <ul ref={measurementsRef} className="flex w-max gap-1.5">
          {items.map(renderItem)}
        </ul>
        <div ref={overflowMeasurementsRef} className="flex w-max gap-1.5">
          {Array.from({ length: String(items.length).length }, (_, index) => (
            <span key={"0".repeat(index + 1)} className={chipClassName}>
              +{"0".repeat(index + 1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
