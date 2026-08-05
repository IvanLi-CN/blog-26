import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:62144";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "docs/specs/admin-soft-ui-redesign/assets/demo";

function ensureEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function waitForHeading(page) {
  await page.getByRole("heading", { name: "文章编辑器" }).waitFor({ timeout: 30_000 });
}

async function openDemoEditor(page) {
  const response = await page.goto(`${BASE_URL}/admin/posts/editor?demo=true`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (response?.status() !== 200) {
    throw new Error(`Failed to open demo editor: ${response?.status() ?? "no-response"}`);
  }
  await waitForHeading(page);
}

async function ensureHardwareDirectoryExpanded(page) {
  const item = page.getByTestId("editor-file-browser").getByRole("button", {
    name: "USB-C Safe5V 诱骗器",
    exact: true,
  });
  if ((await item.count()) > 0) {
    return;
  }
  const hardwareDirectory = page
    .locator('button.pointer-events-auto[aria-label="Hardware 目录"]')
    .first();
  await hardwareDirectory.waitFor({ timeout: 30_000 });
  await hardwareDirectory.click();
  await item.waitFor({ timeout: 30_000 });
}

async function openFile(page, name) {
  const item = page
    .getByTestId("editor-file-browser")
    .getByRole("button", { name, exact: true })
    .first();
  await item.waitFor({ timeout: 30_000 });
  await item.dblclick();
}

async function capturePlainTextMode(page, outputPath) {
  await openDemoEditor(page);
  await ensureHardwareDirectoryExpanded(page);
  await openFile(page, "USB-C Safe5V 诱骗器");
  await page.getByRole("textbox", { name: "Plain text editor" }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: outputPath, fullPage: false });
}

async function captureOversizedFileToast(page, outputPath) {
  await openDemoEditor(page);
  await ensureHardwareDirectoryExpanded(page);
  await openFile(page, "oversized-log.txt");
  await page
    .locator(".Toastify__toast-container")
    .getByText("文件过大，禁止直接打开：Hardware/oversized-log.txt（最大支持 2 MiB）")
    .first()
    .waitFor({ timeout: 30_000 });
  await page.screenshot({ path: outputPath, fullPage: false });
}

async function main() {
  ensureEnv("BASE_URL", BASE_URL);
  ensureEnv("OUTPUT_DIR", OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  try {
    await capturePlainTextMode(page, `${OUTPUT_DIR}/admin-editor-plain-text-source-mode.png`);
    await captureOversizedFileToast(page, `${OUTPUT_DIR}/admin-editor-oversized-text-blocked.png`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
