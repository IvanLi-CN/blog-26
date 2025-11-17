import OpenAI from "openai";
import { getAllowedPrefixes, isValidIconId } from "@/lib/icons/aliases";
import { validateIconExists } from "@/server/services/icon-validate";

export type RerankContext = {
  type: "tag" | "category";
  name: string; // tag full path or category key
  title?: string; // for category
  samples?: Array<{ title: string; excerpt?: string | null }>; // optional
};

export type RerankResult = {
  icon: string | null;
  confidence: number;
  reason: string;
  considered: Array<{ id: string }>;
};

export async function pickBestIcon(ctx: RerankContext): Promise<RerankResult> {
  const key = process.env.OPENAI_API_KEY || "";
  const baseURLRaw = (process.env.OPENAI_API_BASE_URL || process.env.OPENAI_BASE_URL || "").trim();
  const model = process.env.TAG_AI_MODEL || process.env.CHAT_COMPLETION_MODEL || "gpt-4o-mini";
  if (!key) return { icon: null, confidence: 0, reason: "llm_unavailable", considered: [] };
  const baseTrim = (baseURLRaw || "https://api.openai.com/v1").replace(/\/+$/, "");
  // eslint-disable-next-line no-console
  console.log("[icon-reranker] model=", model, " base=", baseTrim);

  const prefixes = getAllowedPrefixes();
  const sys = [
    "You propose Iconify icon IDs for a blog tag or category.",
    `Allowed prefixes only: ${prefixes.join(", ")}.`,
    "Selection rules:",
    "- Brand/technology names: prefer simple-icons (or cib/fa6-brands/bxl if needed).",
    "- Generic concepts/actions/shapes: prefer tabler, line-md, carbon, material-symbols, or game-icons.",
    "- Avoid multi-color or disallowed collections; do not fabricate IDs.",
    "- Use lowercase kebab and official naming conventions when applicable (e.g., simple-icons:nextdotjs).",
    "Respond with ONLY JSON (no markdown, no code fences, no prose).",
    'JSON schema: {"suggestions":[string,...],"reason":string}.',
    "Return up to 10 candidates strictly from allowed prefixes, ordered by preference.",
  ].join("\n");

  const user = {
    type: ctx.type,
    name: ctx.name,
    title: ctx.title,
    samples: (ctx.samples || []).slice(0, 3),
  };

  try {
    const openai = new OpenAI({ apiKey: key, baseURL: baseTrim });
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(user) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const content = completion.choices?.[0]?.message?.content || "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content || "{}");
    } catch {
      const first = content.indexOf("{");
      const last = content.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        const slice = content.slice(first, last + 1);
        try {
          parsed = JSON.parse(slice);
        } catch {
          // eslint-disable-next-line no-console
          console.error("[icon-reranker] failed to parse JSON slice", { content });
          return { icon: null, confidence: 0, reason: "invalid_json", considered: [] };
        }
      } else {
        // eslint-disable-next-line no-console
        console.error("[icon-reranker] missing JSON object in content", { content });
        return { icon: null, confidence: 0, reason: "invalid_json", considered: [] };
      }
    }
    const suggestions: string[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const reason: string = typeof parsed.reason === "string" ? parsed.reason : "";
    const valid: string[] = [];
    const allowedSet = new Set(prefixes);
    for (const s of suggestions) {
      if (typeof s !== "string") continue;
      if (!isValidIconId(s)) continue;
      const pref = s.split(":")[0];
      if (!allowedSet.has(pref)) continue;
      if (await validateIconExists(s)) valid.push(s);
      if (valid.length >= 10) break;
    }
    if (valid.length === 0)
      return { icon: null, confidence: 0, reason: "no_valid_suggestions", considered: [] };
    const icon = valid[0];
    const confidence = Math.min(0.98, 0.9 + Math.max(0, (10 - Math.min(valid.length, 10)) * 0.008));
    return { icon, confidence, reason, considered: valid.map((id) => ({ id })) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[icon-reranker] LLM error", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : typeof error === "string"
          ? error
          : "llm_error";
    // 将底层错误信息直接透出给管理界面，便于排查（仅管理员接口会看到）
    return { icon: null, confidence: 0, reason: message, considered: [] };
  }
}
