import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(resolve(process.cwd(), "site/layouts/BaseLayout.astro"), "utf8");
const assistant = readFileSync(
  resolve(process.cwd(), "site/components/KnowledgeAssistant.tsx"),
  "utf8"
);
const chatPage = readFileSync(resolve(process.cwd(), "site/pages/chat.astro"), "utf8");
const clippingDetail = readFileSync(
  resolve(process.cwd(), "src/components/memos/ClippingDetail.tsx"),
  "utf8"
);

describe("Web Demo request boundary", () => {
  it("keeps simulated connectivity out of the shared document layout", () => {
    expect(layout).not.toContain("<ClientRouter />");
    expect(
      readFileSync(resolve(process.cwd(), "site/components/PublicRouter.tsx"), "utf8")
    ).toContain("webDemoFetch");
    expect(layout).not.toContain("web-demo-navigation-feedback");
    expect(layout).not.toContain("web-demo-navigation");
  });

  it("keeps the assistant on one shared client surface and excludes private cache data", () => {
    expect(layout).toContain("KnowledgeAssistant");
    expect(layout).toContain("!isAssistantPage");
    expect(layout).toContain('const assistantPath = toPublicSitePath("/chat")');
    expect(chatPage).toContain("fullPage");
    expect(assistant).toContain('data-testid="assistant-fab"');
    expect(assistant).toContain('data-testid="assistant-page"');
    expect(assistant).not.toContain("src/server/");
    expect(assistant).toContain("new:clipping:");
    expect(assistant).toContain("!hasExplicitUiState");
    expect(assistant).toContain("currentDraft === submittedDraft");
    expect(assistant).toContain(
      "result.createdConversation && selectedRef.current === requestSelectedId"
    );
    expect(assistant).toContain("job.assistantMessageId === failedMessage.id");
    expect(assistant).toContain("onRetry={(message) => void retry(message)}");
    expect(clippingDetail).toContain("data-assistant-clipping-slug");
    expect(clippingDetail).toContain("hideChat?: boolean");
  });
});
