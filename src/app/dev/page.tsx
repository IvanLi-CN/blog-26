/**
 * Developer Tools Page
 *
 * Development and test environment only developer tools page
 * Provides user account management, quick switching, session status viewing
 *
 * Security restrictions:
 * - Only accessible when NODE_ENV=development or NODE_ENV=test
 * - Production environment returns 404 page
 * - Not included in production builds
 */

import { redirect } from "next/navigation";
import { DevToolsPage } from "@/components/dev-tools/DevToolsPage";

/**
 * Environment check - redirect to 404 in production
 */
function checkEnvironment() {
  if (process.env.NODE_ENV === "production") {
    redirect("/404");
  }
}

export default function DevPage() {
  // Environment check
  checkEnvironment();

  return <DevToolsPage />;
}

/**
 * Force dynamic rendering for development tools
 */
export const dynamic = "force-dynamic";

/**
 * Page metadata
 */
export const metadata = {
  title: "Developer Tools",
  description: "Development environment exclusive tools page",
  robots: {
    index: false,
    follow: false,
  },
};
