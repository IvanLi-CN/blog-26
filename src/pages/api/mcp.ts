import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminEmail } from "@/lib/admin-config";
import { getMcpTransport } from "@/server/mcp";
import { runWithMcpAuth } from "@/server/mcp-auth-context";
import { resolveUserByPersonalAccessToken } from "@/server/services/personal-access-tokens";

export const config = {
  api: {
    // Pass raw body/stream to the transport for streaming support
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Resolve PAT (Authorization: Bearer <token>) and compute admin status
    const authHeader = req.headers.authorization || req.headers["Authorization" as any];
    let userEmail: string | undefined;
    let isAdmin = false;

    if (typeof authHeader === "string") {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      const rawToken = m?.[1]?.trim();
      if (rawToken) {
        try {
          const resolved = await resolveUserByPersonalAccessToken(rawToken);
          if (resolved) {
            userEmail = resolved.user.email;
            const adminEmail = getAdminEmail();
            isAdmin = !!adminEmail && userEmail === adminEmail;
          }
        } catch (e) {
          // Log and continue as unauthenticated/readonly
          console.warn("[MCP] PAT resolve failed:", e);
        }
      }
    }

    await runWithMcpAuth({ isAdmin, userEmail }, async () => {
      const transport = await getMcpTransport();
      await transport.handleRequest(req as any, res as any);
    });
  } catch (err) {
    console.error("/api/mcp handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
