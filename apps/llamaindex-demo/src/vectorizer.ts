import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  OpenAI,
  OpenAIEmbedding,
  Document,
  Settings, // Import Settings
} from 'llamaindex';
import type { DBRecord } from './db.js';
import {
  getAllFileRecords,
  getFileRecord,
  upsertFileRecord,
  deleteFileRecord
} from './db.js';
import type { FileMetadata } from './fileProcessor.js';
import { getMarkdownFiles } from './fileProcessor.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure global LlamaIndex settings
function configureLlamaIndexSettings(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the .env file.");
  }
  if (!baseURL) {
    throw new Error("OPENAI_API_BASE_URL is not set in the .env file.");
  }

  Settings.embedModel = new OpenAIEmbedding({
    model: "text-embedding-3-small",
    apiKey,
    additionalSessionOptions: {
      baseURL,
    },
    // dimensions: 1536, // Optional: specify dimensions for text-embedding-3-small
  });

  // Explicitly type llm instance before assigning to Settings.llm
  const llm: OpenAI = new OpenAI({
    model: "o4-mini",
    apiKey,
    baseURL,
  });
  Settings.llm = llm;
  console.log('LlamaIndex global Settings configured.');
}



async function createLlamaDocumentFromFile(fileMeta: FileMetadata): Promise<Document> {
  const content = await fs.readFile(fileMeta.absolutePath, 'utf-8');
  return new Document({ text: content, id_: fileMeta.filepath });
}

export async function processFilesAndVectorize(): Promise<void> {
  console.log('Starting file processing and vectorization...');
  configureLlamaIndexSettings(); 
  
  console.log('Fetching current markdown files...');
  const currentFilesMeta: FileMetadata[] = await getMarkdownFiles();
  console.log(`Found ${currentFilesMeta.length} markdown files on disk.`);

  console.log('Fetching file records from database...');
  const dbRecordsArray: DBRecord[] = await getAllFileRecords();
  console.log(`Found ${dbRecordsArray.length} records in the database.`);

  let filesAddedOrUpdated = 0;
  let filesDeleted = 0;

  for (const fileMeta of currentFilesMeta) {
    const dbRecord = await getFileRecord(fileMeta.filepath);
    
    if (!dbRecord || dbRecord.content_hash !== fileMeta.content_hash || dbRecord.last_modified_time !== fileMeta.last_modified_time) {
      console.log(`Processing file for vectorization: ${fileMeta.filepath}`);
      
      const document = await createLlamaDocumentFromFile(fileMeta);
      
      // Generate vector embeddings
      const embeddings = await Settings.embedModel.getTextEmbeddings([document.getText()]);
      const vectorBuffer = Buffer.from(new Float32Array(embeddings[0]).buffer); // Convert float array to Buffer

      await upsertFileRecord({
        filepath: fileMeta.filepath,
        content_hash: fileMeta.content_hash,
        last_modified_time: fileMeta.last_modified_time,
        indexed_at: Date.now(),
        vector: vectorBuffer, // Save the vector buffer
      });
      console.log(`Upserted record for ${fileMeta.filepath} with vector in database.`);
      filesAddedOrUpdated++;
    }
  }

  const currentFilePaths = new Set(currentFilesMeta.map(f => f.filepath));
  for (const dbRecord of dbRecordsArray) {
    if (!currentFilePaths.has(dbRecord.filepath)) {
      console.log(`File deleted, removing from DB: ${dbRecord.filepath}`);
      await deleteFileRecord(dbRecord.filepath);
      console.log(`Removed record for ${dbRecord.filepath} from database.`);
      filesDeleted++;
    }
  }
  
  console.log('File processing and vectorization complete.');
  console.log(`Summary: ${filesAddedOrUpdated} files added/updated, ${filesDeleted} files deleted.`);
}