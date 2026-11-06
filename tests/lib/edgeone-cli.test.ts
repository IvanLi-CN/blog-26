import { describe, expect, test } from "bun:test";
import { edgeOneCliSummary } from "../../src/lib/release/edgeone-cli";

describe("EdgeOne child process diagnostics", () => {
  test("retains the failed API boundary without leaking API bodies or signed URLs", () => {
    const output = [
      "Using provided API token secret-token",
      "Using Project ID: private-id",
      "Uploading archive",
      "Creating deployment in Production environment",
      "CreatePagesDeployment failed: UnauthorizedOperation; token=temporary-secret",
      "https://preview.example/?eo_token=signed-secret",
    ].join("\n");
    expect(edgeOneCliSummary(output, 1)).toEqual({
      exitCode: 1,
      phases: ["token", "project", "upload", "create"],
      failures: ["create", "access-denied"],
    });
  });
  test("distinguishes process termination from a failed upload", () => {
    expect(edgeOneCliSummary("Uploading archive", 137)).toEqual({
      exitCode: 137,
      phases: ["upload"],
      failures: [],
    });
    expect(edgeOneCliSummary("Error uploading: SignatureDoesNotMatch", 1).failures).toEqual([
      "upload",
      "signature",
    ]);
  });
  test("unknown output is never copied into public diagnostics", () => {
    expect(edgeOneCliSummary("secret and https://private.example/token", 2)).toEqual({
      exitCode: 2,
      phases: [],
      failures: [],
    });
  });
});
