// Report only fixed labels: CLI output can contain tokens and signed preview URLs.
export function edgeOneCliSummary(output: string, exitCode: number) {
  const phases = [
    ["token", "Using provided API token"],
    ["project", "Using Project ID"],
    ["upload", "Uploading"],
    ["create", "Creating deployment"],
    ["poll", "Created deployment with Deployment ID"],
    ["complete", "Deployment successful"],
  ] as const;
  const failures = [
    ["npm-canceled", /npm error (?:code )?canceled/i],
    ["authentication", /Invalid EDGEONE_PAGES_API_TOKEN|No API token provided/i],
    ["project-provider", /Only projects with Provider 'Upload'/],
    ["local-path", /localPath does not exist|localPath must be/],
    ["cos-parameters", /Missing required COS parameters|Failed to get COS token/],
    ["compression", /Compression failed/],
    ["upload", /Error uploading|File upload failed|Batch upload failed/],
    ["create", /CreatePagesDeployment failed|Failed to create deployment/],
    ["deployment-status", /Deployment failed with status/],
    ["access-denied", /AccessDenied|UnauthorizedOperation|Forbidden/],
    ["signature", /SignatureDoesNotMatch|SignatureFailure/],
    ["network", /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i],
    ["memory", /heap out of memory|Allocation failed|Killed/],
  ] as const;
  return {
    exitCode,
    phases: phases.filter(([, marker]) => output.includes(marker)).map(([name]) => name),
    failures: failures.filter(([, pattern]) => pattern.test(output)).map(([name]) => name),
  };
}
