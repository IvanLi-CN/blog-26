import "@fontsource-variable/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "~/components/theme-provider";
import { router } from "~/router";
import "~/styles.css";

const queryClient = new QueryClient();
const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Admin app root element #app not found");
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </QueryClientProvider>
);
