import type { PlaybookStore } from "@/lib/playbook/cache";
import { encodeJson } from "@/lib/playbook/manifest";
import { getPlaybookPolicies } from "@/lib/playbook/navigation";
import type { PlaybookEdition } from "@/lib/playbook/types";
import type { PlaybookStoredSnapshot } from "../services/playbook-snapshot-store";

type PublicPlaybookSource =
  | PlaybookStoredSnapshot
  | PlaybookEdition
  | PlaybookStore
  | null
  | undefined;
type PublicPlaybookContent = Pick<PlaybookStoredSnapshot, "catalog" | "search"> | PlaybookEdition;

function isStoredSnapshot(value: PublicPlaybookContent): value is PlaybookStoredSnapshot {
  return "contentHash" in value && "sourceRevision" in value;
}

function publicSearch(current: PublicPlaybookContent) {
  if (!isStoredSnapshot(current)) return current.search;
  const { generated_at: _generatedAt, ...search } = current.search;
  return search;
}

function currentPlaybook(source: PublicPlaybookSource): PublicPlaybookContent | null {
  if (!source) return null;
  if ("current" in source) return source.current ?? null;
  return source;
}

export function handlePlaybookRequest(
  request: Request,
  path: string,
  source: PublicPlaybookSource
) {
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  const current = currentPlaybook(source);
  if (!current) return Response.json({ error: "Playbook unavailable" }, { status: 503 });

  const url = new URL(request.url);
  if (path === "/playbook/search-index")
    return new Response(encodeJson(publicSearch(current)), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  const policy = getPlaybookPolicies(current.catalog).find(
    (item) => item.summary.slug === url.searchParams.get("policy")
  );
  const resourcePath = url.searchParams.get("path");
  const content =
    policy &&
    (resourcePath === "SKILL.md"
      ? `---\n${JSON.stringify(policy.frontmatter, null, 2)}\n---\n\n${policy.instruction_markdown}\n`
      : policy.resources.find((item) => item.path === resourcePath)?.content);
  if (content === undefined || !policy) return new Response("Resource not found", { status: 404 });
  return new Response(content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": "attachment",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
