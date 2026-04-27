import { describe, expect, it } from "bun:test";
import {
  decorateUpstreamLlmModelNames,
  findBuiltinLlmModel,
  toBuiltinLlmModelOptions,
} from "../llm-models";

describe("llm model database", () => {
  it("matches builtin model details by exact model id", () => {
    expect(findBuiltinLlmModel("gpt-4o-mini")?.description).toBeTruthy();
    expect(findBuiltinLlmModel("gpt-4o-mini-latest")).toBeUndefined();
  });

  it("decorates upstream model names with builtin information when matched", () => {
    const [known, unknown] = decorateUpstreamLlmModelNames([
      "provider/new-experimental-model",
      "gpt-4o-mini",
    ]);

    expect(known.id).toBe("gpt-4o-mini");
    expect(known.known).toBe(true);
    expect(known.description).toBeTruthy();
    expect(known.capabilities).toContain("chat");
    expect(unknown.id).toBe("provider/new-experimental-model");
    expect(unknown.known).toBe(false);
    expect(unknown.description).toBeUndefined();
  });

  it("returns builtin options from the local database", () => {
    expect(toBuiltinLlmModelOptions().some((model) => model.id === "gpt-4o-mini")).toBe(true);
  });
});
