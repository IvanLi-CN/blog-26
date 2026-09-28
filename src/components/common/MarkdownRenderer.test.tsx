import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("MarkdownRenderer empty content", () => {
  test("uses the theme-aware faint text class for its placeholder", () => {
    const { getByText } = render(<MarkdownRenderer content="" />);

    expect(getByText("暂无内容").className).toContain("nature-faint");
  });
});
