import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MARKDOWN_DIR is relative to the project root (apps/llamaindex-demo)
// but we resolve it from the current file's directory (__dirname in src)
const PROJECT_ROOT_FROM_SRC = path.resolve(__dirname, '..');
const MARKDOWN_DIR_ABSOLUTE = '/Volumes/External/Projects/Ivan/blog-astrowind/src/content/post'; // Set absolute path directly


export interface FileMetadata {
  filepath: string; // Relative to MARKDOWN_DIR_ABSOLUTE
  absolutePath: string;
  last_modified_time: number;
  content_hash: string;
}

async function calculateHash(content: string): Promise<string> {
  const hasher = crypto.createHash("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}

async function getFileModifiedTime(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.mtime.getTime();
}

export async function getMarkdownFiles(): Promise<FileMetadata[]> {
  const filesMetadata: FileMetadata[] = [];
  
  async function scanDirectory(directory: string, relativeBasePath: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.join(relativeBasePath, entry.name);

      if (entry.isDirectory()) {
        // Exclude node_modules or other irrelevant directories if necessary
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'storage') {
            continue;
        }
        await scanDirectory(fullPath, relativePath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const hash = await calculateHash(content);
          const modifiedTime = await getFileModifiedTime(fullPath);
          
          filesMetadata.push({
            filepath: relativePath, // Store path relative to MARKDOWN_DIR_ABSOLUTE
            absolutePath: fullPath,
            last_modified_time: modifiedTime,
            content_hash: hash,
          });
        } catch (error) {
          console.warn(`Could not process file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  try {
    await fs.access(MARKDOWN_DIR_ABSOLUTE); // Check if directory exists
    await scanDirectory(MARKDOWN_DIR_ABSOLUTE, ''); // Start scan with empty relative base
  } catch (error) {
     console.error(`Error accessing or scanning directory ${MARKDOWN_DIR_ABSOLUTE}: ${error instanceof Error ? error.message : String(error)}`);
     // Depending on requirements, you might want to throw the error or return empty/partial results
  }
  
  return filesMetadata;
}

// Example usage (for testing this module directly)
// if (import.meta.main) {
//   (async () => {
//     console.log('Scanning directory:', MARKDOWN_DIR_ABSOLUTE);
//     const files = await getMarkdownFiles();
//     console.log(`Found ${files.length} markdown files:`);
//     files.forEach(file => {
//       console.log(`- ${file.filepath} (hash: ${file.content_hash}, modified: ${new Date(file.last_modified_time).toISOString()})`);
//     });
//   })();
// }