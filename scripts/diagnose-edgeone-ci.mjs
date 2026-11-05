// Read-only probes. Never emit response bodies, headers, signed URLs or credentials.
const token = process.env.EDGEONE_API_TOKEN;
const projectName = process.env.EDGEONE_PROJECT_NAME;
if (!token || !projectName) throw new Error("EdgeOne diagnostic configuration missing");

const code = (value) =>
  typeof value === "number" || (typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value))
    ? value
    : undefined;

async function probe(region, base, action, parameters) {
  const started = Date.now();
  try {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Action: action, ...parameters }),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    const payload = await response.json();
    const data = payload.Data?.Response;
    console.log(
      JSON.stringify({
        region,
        action,
        elapsedMs: Date.now() - started,
        httpStatus: response.status,
        code: code(payload.Code),
        errorCode: code(data?.Error?.Code),
        projectFound:
          action === "DescribePagesProjects"
            ? Boolean(data?.Projects?.some((p) => p.Name === projectName))
            : undefined,
      })
    );
    return payload.Code === 0 ? data : undefined;
  } catch (error) {
    console.log(
      JSON.stringify({
        region,
        action,
        elapsedMs: Date.now() - started,
        networkError: code(error.cause?.code) ?? code(error.name) ?? "unknown",
      })
    );
  }
}

let domesticFound = false;
for (const [region, base] of [
  ["china", "https://pages-api.cloud.tencent.com/v1"],
  ["global", "https://pages-api.edgeone.ai/v1"],
]) {
  const data = await probe(region, base, "DescribePagesProjects", {
    Filters: [{ Name: "Name", Values: [projectName] }],
    Offset: 0,
    Limit: 10,
  });
  const project = data?.Projects?.find((p) => p.Name === projectName);
  if (!project) continue;
  if (region === "china") domesticFound = true;
  console.log(JSON.stringify({ region, uploadProvider: project.Provider === "Upload" }));
  await probe(region, base, "DescribePagesCosTempToken", { ProjectId: project.ProjectId });
}
if (!domesticFound) process.exitCode = 1;
