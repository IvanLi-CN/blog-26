/** Drain both pipes while the runner keeps polling its normal event loop. */
export async function runBun(args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}
