import { createContext } from "react";

export interface ConversationPresentationStore {
  read(field: string): number | boolean | undefined;
  write(field: string, value: number | boolean): void;
}
export const ConversationPresentationContext = createContext<ConversationPresentationStore | null>(
  null
);

export function createSessionPresentationStore(key: string): ConversationPresentationStore {
  return {
    read: (field) => readConversationPresentation(key)[field],
    write: (field, value) => writeConversationPresentation(key, field, value),
  };
}

/** Owner retains this store across view unmounts and replaces it at identity boundaries. */
export function createMemoryPresentationStore(): ConversationPresentationStore {
  const values = new Map<string, number | boolean>();
  return {
    read: (field) => values.get(field),
    write(field, value) {
      values.delete(field);
      values.set(field, value);
      if (values.size > 256) values.delete(values.keys().next().value as string);
    },
  };
}

/** Bounded, principal-scoped presentation metadata only; never stores message text. */
export function readConversationPresentation(key: string): Record<string, number | boolean> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([field, value]) =>
            (field === "scroll" &&
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= 0) ||
            (field.startsWith("code:") && typeof value === "boolean")
        )
        .slice(-256)
    );
  } catch {
    return {};
  }
}
export function writeConversationPresentation(key: string, field: string, value: number | boolean) {
  try {
    const prefix = key.slice(0, key.lastIndexOf(":presentation:") + 14);
    const keys = Object.keys(sessionStorage).filter((candidate) => candidate.startsWith(prefix));
    for (const stale of keys
      .filter((candidate) => candidate !== key)
      .slice(0, Math.max(0, keys.length - 23))) {
      sessionStorage.removeItem(stale);
    }
    const state = readConversationPresentation(key);
    delete state[field];
    state[field] = value;
    sessionStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries(Object.entries(state).slice(-256)))
    );
  } catch {
    /* Storage may be disabled. */
  }
}
