import { afterEach, expect, test } from "bun:test";
import {
  createMemoryPresentationStore,
  createSessionPresentationStore,
  readConversationPresentation,
  writeConversationPresentation,
} from "./presentation-state";

const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "sessionStorage", original);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});
function storage() {
  const values: Record<string, string> = {};
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: new Proxy(values, {
      get(target, key) {
        if (key === "getItem") return (name: string) => target[name] ?? null;
        if (key === "setItem")
          return (name: string, value: string) => {
            target[name] = value;
          };
        if (key === "removeItem")
          return (name: string) => {
            delete target[name];
          };
        return Reflect.get(target, key);
      },
    }),
  });
  return values;
}
test("presentation metadata isolates principals and bounds conversations and blocks", () => {
  const values = storage();
  writeConversationPresentation("ui:b:presentation:c", "code:m:0", false);
  for (let i = 0; i < 300; i++)
    writeConversationPresentation("ui:a:presentation:c", `code:m:${i}`, false);
  expect(Object.keys(readConversationPresentation("ui:a:presentation:c"))).toHaveLength(256);
  expect(readConversationPresentation("ui:b:presentation:c")["code:m:0"]).toBe(false);
  for (let i = 0; i < 40; i++) writeConversationPresentation(`ui:a:presentation:${i}`, "scroll", i);
  expect(Object.keys(values).filter((key) => key.startsWith("ui:a:"))).toHaveLength(24);
  expect(readConversationPresentation("ui:b:presentation:c")["code:m:0"]).toBe(false);
});
test("invalid and unavailable storage never becomes presentation state", () => {
  const values = storage();
  for (const invalid of [
    "null",
    "[]",
    "broken",
    '{"scroll":-1,"code:m:0":"false","text":"private"}',
  ]) {
    values["ui:a:presentation:c"] = invalid;
    expect(readConversationPresentation("ui:a:presentation:c")).toEqual({});
  }
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("disabled");
    },
  });
  expect(readConversationPresentation("ui:a:presentation:c")).toEqual({});
  expect(() => writeConversationPresentation("ui:a:presentation:c", "scroll", 20)).not.toThrow();
});

test("retained memory store survives view consumers without browser storage and isolates replacement", () => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("must not access browser storage");
    },
  });
  const retained = createMemoryPresentationStore();
  const firstView = retained;
  firstView.write("code:message:0", false);
  const reopenedView = retained;
  expect(reopenedView.read("code:message:0")).toBe(false);
  const nextConversation = createMemoryPresentationStore();
  expect(nextConversation.read("code:message:0")).toBeUndefined();
  for (let i = 0; i < 256; i++) retained.write(`code:other:${i}`, true);
  expect(retained.read("code:message:0")).toBeUndefined();
  expect(retained.read("code:other:255")).toBe(true);
});
test("session adapter retains existing metadata key format", () => {
  storage();
  const store = createSessionPresentationStore("ui:a:presentation:c");
  store.write("code:m:0", false);
  expect(readConversationPresentation("ui:a:presentation:c")["code:m:0"]).toBe(false);
  expect(createSessionPresentationStore("ui:a:presentation:c").read("code:m:0")).toBe(false);
});
