import type { PlaybookStore } from "@/lib/playbook/cache";
import { encodeJson } from "@/lib/playbook/manifest";
import { getPlaybookPolicies } from "@/lib/playbook/navigation";
import { digestSchema } from "@/lib/playbook/schema";

export async function handlePlaybookRequest(request: Request, path: string, store: PlaybookStore) {
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  const url = new URL(request.url);
  const digest = digestSchema.safeParse(url.searchParams.get("edition"));
  if (!digest.success)
    return Response.json({ error: "A valid edition is required" }, { status: 400 });
  await store.load();
  const edition = store.getEdition(digest.data);
  if (!edition)
    return Response.json({ error: "Edition unavailable; refresh the page" }, { status: 409 });
  if (path === "/playbook/search-index")
    return new Response(encodeJson(edition.search), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-playbook-edition": digest.data,
      },
    });
  const policy = getPlaybookPolicies(edition.catalog).find(
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
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
