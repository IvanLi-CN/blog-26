export function withoutDeploymentCredentials(
  base: Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {}
) {
  const env = { ...base, ...overrides };
  for (const key of ["EDGEONE_API_TOKEN", "EDGEONE_PROJECT_NAME", "GH_TOKEN", "GITHUB_TOKEN"])
    delete env[key];
  for (const key of Object.keys(env)) {
    if (/(?:TOKEN|SECRET|PRIVATE_KEY|PASSWORD|AUTHORIZATION)/.test(key)) delete env[key];
  }
  return env;
}
