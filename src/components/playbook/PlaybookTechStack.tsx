import { useState } from "react";
import {
  formatTechStackRaw,
  parsePlaybookTechStack,
  shouldCollapseTechStackList,
  type TechStackEntry,
  type TechStackNode,
  techStackArrayMode,
} from "@/lib/playbook/tech-stack";
import PlaybookTechStackChips from "./PlaybookTechStackChips";
import PlaybookTechStackRaw from "./PlaybookTechStackRaw";

const TECH_STACK_PREVIEW_ITEMS = 4;

function ScalarValue({ value }: { value: string | number | boolean }) {
  return (
    <code className="max-w-full break-words font-mono text-sm font-medium text-[color:var(--nature-accent-strong)]">
      {String(value)}
    </code>
  );
}

function ListItems({ entry, items }: { entry: TechStackEntry; items: TechStackNode[] }) {
  const mode = techStackArrayMode(items);
  const [expanded, setExpanded] = useState(false);
  if (mode === "chips") return <PlaybookTechStackChips entry={entry} items={items} />;
  const renderItems = (visibleItems: TechStackNode[]) => {
    const keys = new Map<string, number>();
    return (
      <ul className="space-y-1">
        {visibleItems.map((item) => {
          const baseKey = `${entry.key}-${item.kind === "scalar" ? String(item.value) : JSON.stringify(item)}`;
          const occurrence = keys.get(baseKey) ?? 0;
          keys.set(baseKey, occurrence + 1);
          return (
            <li key={`${baseKey}-${occurrence}`} className="min-w-0">
              {item.kind === "scalar" ? (
                <span className="flex min-w-0 items-baseline gap-2 break-words font-mono text-sm leading-6 text-[color:var(--nature-text-soft)]">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--nature-accent)]"
                  />
                  {String(item.value)}
                </span>
              ) : (
                <NodeValue entry={entry} value={item} />
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  if (!shouldCollapseTechStackList(entry.key, items.length)) return renderItems(items);
  const visibleItems = items.slice(0, TECH_STACK_PREVIEW_ITEMS);
  const remainingItems = items.slice(TECH_STACK_PREVIEW_ITEMS);
  const overflowId = `tech-stack-list-${entry.key}`;
  const toggleLabel = expanded
    ? `收起其余 ${remainingItems.length} 项`
    : `展开其余 ${remainingItems.length} 项`;
  const overflowChip = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={overflowId}
      aria-label={toggleLabel}
      title={toggleLabel}
      onClick={() => setExpanded(!expanded)}
      style={{ lineHeight: "1rem" }}
      className="inline-flex shrink-0 items-center rounded-full border border-[rgba(var(--nature-accent-rgb),0.24)] bg-[rgba(var(--nature-accent-rgb),0.1)] px-2 py-0.5 font-mono text-[11px] font-medium leading-4 text-[color:var(--nature-accent-strong)] transition-colors hover:bg-[rgba(var(--nature-accent-rgb),0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent)]"
    >
      {expanded ? `−${remainingItems.length}` : `+${remainingItems.length}`}
    </button>
  );

  return (
    <div className="space-y-1">
      {renderItems(expanded ? items : visibleItems)}
      <div id={overflowId} className="pt-0.5">
        {overflowChip}
      </div>
    </div>
  );
}

function RecordValue({ entries }: { entries: TechStackEntry[] }) {
  return (
    <dl className="mt-1 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5">
      {entries.flatMap((entry) => [
        <dt
          key={`${entry.key}-label`}
          className="text-xs font-semibold tracking-wide text-[color:var(--nature-text-soft)]"
        >
          {entry.label}
        </dt>,
        <dd key={`${entry.key}-value`} className="min-w-0">
          <NodeValue entry={entry} value={entry.value} />
        </dd>,
      ])}
    </dl>
  );
}

function NodeValue({ entry, value }: { entry: TechStackEntry; value: TechStackNode }) {
  if (value.kind === "scalar") return <ScalarValue value={value.value} />;
  if (value.kind === "list") return <ListItems entry={entry} items={value.items} />;
  return <RecordValue entries={value.entries} />;
}

export default function PlaybookTechStack({ value }: { value: unknown }) {
  const groups = parsePlaybookTechStack(value);
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>(undefined);
  if (groups.length === 0) return null;
  const selectedGroupId = groups.some((group) => group.id === activeGroupId)
    ? activeGroupId
    : groups[0]?.id;
  const tabsId = "playbook-tech-stack-tabs";
  return (
    <section
      className="mb-6 border-b border-[color:var(--nature-line)] pb-4"
      aria-labelledby="playbook-tech-stack-title"
    >
      <div>
        <h2
          id="playbook-tech-stack-title"
          className="font-heading text-2xl font-semibold tracking-normal text-[color:var(--nature-text)]"
        >
          技术栈
        </h2>
      </div>
      <div
        id={tabsId}
        role="tablist"
        aria-label="技术栈分类"
        className="mt-1 flex max-w-full gap-0.5 overflow-x-auto border-b border-[color:var(--nature-line)]"
      >
        {groups.map((group, index) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${group.id}`}
            aria-selected={selectedGroupId === group.id}
            aria-controls={`playbook-tech-stack-panel-${group.id}`}
            tabIndex={selectedGroupId === group.id ? 0 : -1}
            onClick={() => setActiveGroupId(group.id)}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const nextIndex =
                event.key === "ArrowRight"
                  ? (index + 1) % groups.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + groups.length) % groups.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? groups.length - 1
                        : undefined;
              if (nextIndex === undefined) return;
              event.preventDefault();
              setActiveGroupId(groups[nextIndex].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [nextIndex]?.focus({ preventScroll: true });
            }}
            className="nature-link-action group inline-flex shrink-0 items-center rounded focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--nature-accent)]"
          >
            <span
              className={`rounded px-2 py-1 text-xs leading-4 transition-colors ${
                selectedGroupId === group.id
                  ? "bg-[rgba(var(--nature-accent-rgb),0.12)] font-semibold text-[color:color-mix(in_srgb,var(--nature-accent-strong)_80%,var(--nature-text))]"
                  : "font-medium text-[color:var(--nature-text-soft)] group-hover:bg-[rgba(var(--nature-accent-rgb),0.06)] group-hover:text-[color:var(--nature-text)] group-focus-visible:text-[color:var(--nature-text)]"
              }`}
            >
              {group.label}
            </span>
          </button>
        ))}
      </div>
      {groups.map((group) => (
        <section
          key={group.id}
          id={`playbook-tech-stack-panel-${group.id}`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-tab-${group.id}`}
          hidden={selectedGroupId !== group.id}
          className="min-w-0 pt-2"
        >
          <h3 className="sr-only">{group.label}</h3>
          <dl className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-2.5">
            {group.entries.flatMap((entry) => [
              <dt
                key={`${entry.key}-label`}
                className="text-xs font-semibold tracking-wide text-[color:var(--nature-text-soft)]"
              >
                {entry.label}
              </dt>,
              <dd key={`${entry.key}-value`} className="min-w-0">
                <NodeValue entry={entry} value={entry.value} />
              </dd>,
            ])}
          </dl>
        </section>
      ))}
      <PlaybookTechStackRaw value={value} />
      <noscript>
        <details className="mt-2">
          <summary>技术栈完整数据（无需 JavaScript）</summary>
          <pre className="max-w-full overflow-auto whitespace-pre-wrap px-3 py-2.5 [overflow-wrap:anywhere]">
            {formatTechStackRaw(value)}
          </pre>
        </details>
      </noscript>
    </section>
  );
}
