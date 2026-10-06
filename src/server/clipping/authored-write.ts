import { randomUUID } from "node:crypto";
import { open, rename, stat, unlink } from "node:fs/promises";

/** Stage beside the original so an interrupted restore cannot truncate authored content. */
export async function replaceAuthoredContent(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.restore.tmp`;
  const original = await stat(path);
  try {
    const file = await open(temporary, "wx", original.mode & 0o777);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
