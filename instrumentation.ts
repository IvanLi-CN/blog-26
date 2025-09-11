/**
 * Next.js instrumentation hook
 * 在服务端启动后打印所有环境变量（仅一次）。
 */

export async function register() {
  try {
    const entries = Object.entries(process.env as Record<string, string>)
      .map(([k, v]) => [k, v])
      .sort((a, b) => a[0].localeCompare(b[0]));

    console.log("🌐 [Startup] Environment variables (process.env):");
    for (const [k, v] of entries) {
      console.log(`   ${k}=${v ?? ""}`);
    }
  } catch (e) {
    console.warn("Failed printing environment variables in instrumentation:", e);
  }
}
