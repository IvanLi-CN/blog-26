import { expect, test } from "@playwright/test";
import { E2E_MCP_TEST_PAT_TOKEN, readE2EBaseUrl } from "../runtime";
import {
  callMcpRpc,
  closeMcpSessionIfNeeded,
  initializeMcpSession,
  seedE2EAdminPat,
} from "./helpers";

const BASE_URL = readE2EBaseUrl();
const TEST_PAT = E2E_MCP_TEST_PAT_TOKEN;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url: string, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr: any;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      lastErr = e;
    }
    await wait(300);
  }
  throw new Error(`Timeout waiting for ${url}: ${String(lastErr || "unknown error")}`);
}

async function findMemoByTitle(title: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const listed = await callMcpRpc({
      jsonrpc: "2.0",
      id: `list-${Date.now()}`,
      method: "tools/call",
      params: { name: "memos_list", arguments: { limit: 10, publicOnly: false, search: title } },
    });
    const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
    const memo = items.find((x: any) => x.title?.includes(title));
    if (memo?.slug) return memo;
    await wait(300);
  }
  return undefined;
}

test.beforeAll(
  async () => {
    await waitFor(BASE_URL, 60000);
    await seedE2EAdminPat();
    const initialized = await initializeMcpSession();
    expect(initialized.error).toBeFalsy();
  },
  { timeout: 90_000 }
);

test.afterAll(async () => {
  await closeMcpSessionIfNeeded();
});

test("create memo via MCP (PAT) then list it", async () => {
  const title = `sdk-e2e-${Date.now()}`;
  const created = await callMcpRpc(
    {
      jsonrpc: "2.0",
      id: "c1",
      method: "tools/call",
      params: {
        name: "memos_create",
        arguments: { content: title, title, isPublic: true, tags: [] },
      },
    },
    TEST_PAT
  );
  expect(created.error).toBeFalsy();
  expect(created.result?.isError).toBeFalsy();

  const memo = await findMemoByTitle(title);
  expect(memo?.slug).toBeTruthy();
});
