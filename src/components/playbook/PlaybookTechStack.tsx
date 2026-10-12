import { useState } from "react";
import {
  formatTechStackRaw,
  parsePlaybookTechStack,
  shouldCollapseTechStackList,
  type TechStackEntry,
  type TechStackNode,
  techStackArrayMode,
} from "@/lib/playbook/tech-stack";

function ScalarValue({ value }: { value: string | number | boolean }) {
  return (
    <code className="max-w-full break-words font-mono text-sm font-medium text-[color:var(--nature-accent-strong)]">
      {String(value)}
    </code>
  );
}

function ListItems({ entry, items }: { entry: TechStackEntry; items: TechStackNode[] }) {
  const mode = techStackArrayMode(items);
  const keys = new Map<string, number>();
  const content = (
    <ul className={mode === "chips" ? "flex flex-wrap gap-1.5" : "space-y-1"}>
      {items.map((item) => {
        const baseKey = `${entry.key}-${item.kind === "scalar" ? String(item.value) : JSON.stringify(item)}`;
        const occurrence = keys.get(baseKey) ?? 0;
        keys.set(baseKey, occurrence + 1);
        return (
          <li key={`${baseKey}-${occurrence}`} className="min-w-0">
            {item.kind === "scalar" ? (
              mode === "chips" ? (
                <span className="inline-flex max-w-full break-words rounded-full border border-[rgba(var(--nature-accent-rgb),0.24)] bg-[rgba(var(--nature-accent-rgb),0.1)] px-2 py-0.5 font-mono text-[11px] font-medium leading-4 text-[color:var(--nature-accent-strong)]">
                  {String(item.value)}
                </span>
              ) : (
                <span className="flex min-w-0 items-baseline gap-2 break-words font-mono text-sm leading-6 text-[color:var(--nature-text-soft)]">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--nature-accent)]"
                  />
                  {String(item.value)}
                </span>
              )
            ) : (
              <NodeValue entry={entry} value={item} />
            )}
          </li>
        );
      })}
    </ul>
  );

  if (!shouldCollapseTechStackList(entry.key, items.length)) return content;
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[color:var(--nature-accent-strong)] underline decoration-[color:var(--nature-line-strong)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--nature-accent)]">
        共 {items.length} 项
      </summary>
      <div className="mt-2">{content}</div>
    </details>
  );
}

function RecordValue({ entries }: { entries: TechStackEntry[] }) {
  return (
    <dl className="mt-1 min-w-0 space-y-1.5">
      {entries.map((entry) => (
        <div key={entry.key} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <dt className="text-xs font-semibold tracking-wide text-[color:var(--nature-text-soft)]">
            {entry.label}
          </dt>
          <dd className="min-w-0 flex-1">
            <NodeValue entry={entry} value={entry.value} />
          </dd>
        </div>
      ))}
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
        className="mt-2 flex max-w-full gap-1 overflow-x-auto border-b border-[color:var(--nature-line)] pb-1"
      >
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${group.id}`}
            aria-selected={selectedGroupId === group.id}
            aria-controls={`playbook-tech-stack-panel-${group.id}`}
            tabIndex={selectedGroupId === group.id ? 0 : -1}
            onClick={() => setActiveGroupId(group.id)}
            className={`min-h-11 shrink-0 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent)] ${
              selectedGroupId === group.id
                ? "bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]"
                : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-accent-rgb),0.06)] hover:text-[color:var(--nature-text)]"
            }`}
          >
            {group.label}
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
          className="min-w-0 pt-3"
        >
          <h3 className="sr-only">{group.label}</h3>
          <dl className="min-w-0 space-y-2.5">
            {group.entries.map((entry) => (
              <div
                key={entry.key}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1"
              >
                <dt className="text-xs font-semibold tracking-wide text-[color:var(--nature-text-soft)]">
                  {entry.label}
                </dt>
                <dd className="min-w-0 flex-1">
                  <NodeValue entry={entry} value={entry.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <details className="mt-4 border-t border-[color:var(--nature-line)] pt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[color:var(--nature-accent-strong)] underline decoration-[color:var(--nature-line-strong)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--nature-accent)]">
          查看原始数据
        </summary>
        <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-[rgba(var(--nature-accent-rgb),0.07)] p-2.5 text-xs leading-5 text-[color:var(--nature-text-soft)]">
          {formatTechStackRaw(value)}
        </pre>
      </details>
    </section>
  );
}
