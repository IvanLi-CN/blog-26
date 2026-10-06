import "@fontsource-variable/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "~/components/theme-provider";
import { router } from "~/router";
import "~/styles.css";
import {
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
} from "@/lib/web-demo-runtime";

const queryClient = new QueryClient();
const rootElement = document.getElementById("app");
const isAdminWebDemoBuild = import.meta.env.VITE_WEB_DEMO_BUILD === "true";

if (!rootElement) {
  throw new Error("Admin app root element #app not found");
}

function renderBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  rootElement.replaceChildren();
  const errorRoot = document.createElement("main");
  errorRoot.className = "min-h-screen bg-background p-6 text-foreground";
  errorRoot.innerHTML = `
    <section class="mx-auto max-w-xl rounded-3xl bg-card p-6 shadow-xl">
      <h1 class="text-xl font-semibold">Web Demo 初始化失败</h1>
      <p class="mt-3 text-sm text-muted-foreground">演示数据未能安全接管请求，页面已停止加载。</p>
      <pre class="mt-4 overflow-x-auto rounded-2xl bg-muted p-4 text-xs">${message.replaceAll("<", "&lt;")}</pre>
    </section>
  `;
  rootElement.append(errorRoot);
}

async function bootstrapAdminApp() {
  try {
    if (isAdminWebDemoBuild) {
      const { setupAdminDemoApiMocks } = await import("~/demo/mock-admin-api");
      setupAdminDemoApiMocks();
    }

    if (isAdminWebDemoBuild) {
      const refreshDemoQueries = (event: Event) => {
        const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
        if (
          event.type === WEB_DEMO_STATE_EVENT ||
          detail?.action === "refresh-data" ||
          detail?.action === "reset-state"
        ) {
          void queryClient.invalidateQueries();
        }
      };
      window.addEventListener(WEB_DEMO_STATE_EVENT, refreshDemoQueries);
      window.addEventListener(WEB_DEMO_ACTION_EVENT, refreshDemoQueries);
    }

    ReactDOM.createRoot(rootElement).render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  } catch (error) {
    renderBootstrapError(error);
  }
}

void bootstrapAdminApp();
