import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  OpenAI,
  OpenAIEmbedding,
  Settings,
} from 'llamaindex';
import { findSimilarFiles } from './db.js'; // Import findSimilarFiles

dotenv.config();

// Configure global LlamaIndex settings specifically for RAG
// This ensures RAG uses the same (or intended) models and API configurations
function configureLlamaIndexSettingsForRAG(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the .env file for RAG.");
  }
  if (!baseURL) {
    throw new Error("OPENAI_API_BASE_URL is not set in the .env file for RAG.");
  }

  // Ensure embedModel is configured if not already globally set by vectorizer
  // or if RAG needs a specific one (though usually it's the same as indexing)
  Settings.embedModel = new OpenAIEmbedding({
    model: "text-embedding-3-small",
    apiKey,
    baseURL
  });
  console.log('RAG: OpenAIEmbedding configured for Settings.embedModel.');


  // LLM for RAG
  const llm: OpenAI = new OpenAI({
    model: "o4-mini", // User specified LLM for RAG
    apiKey,
    baseURL,
  });
  Settings.llm = llm;
  console.log('RAG: OpenAI LLM (o4-mini) configured for Settings.llm.');
}

export async function testRAG(query: string): Promise<void> {
  console.log(`Testing RAG with query: "${query}"`);
  configureLlamaIndexSettingsForRAG();

  try {
    // 1. Vectorize the user query
    console.log('Generating embedding for query...');
    console.log(Settings.embedModel)
    const queryEmbeddings = await Settings.embedModel.getTextEmbeddings([query]);
    const queryVector = Buffer.from(new Float32Array(queryEmbeddings[0]).buffer);

    // 2. Find similar files in the database
    console.log('Searching for similar files in database...');
    const similarFiles = await findSimilarFiles(queryVector, 3); // Get top 3 similar files

    if (similarFiles.length === 0) {
      console.log("No similar files found in the database.");
      return;
    }

    console.log(`Found ${similarFiles.length} similar files:`);
    similarFiles.forEach(file => {
      console.log(`- ${file.filepath} (Score: ${file.score.toFixed(4)})`);
    });

    // 3. Build context from similar files
    let context = "";
    for (const file of similarFiles) {
      // Assuming file.filepath is relative to the project root or a known base path
      // You might need to adjust the path resolution based on your file structure
      const absolutePath = path.resolve('/Volumes/External/Projects/Ivan/blog-astrowind/src/content/post', file.filepath); // Adjust base path as needed
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        context += `## Source: ${file.filepath}\n\n${content}\n\n`;
      } catch (error) {
        console.warn(`Could not read file ${absolutePath} for context: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!context) {
      console.log("Could not build context from retrieved files.");
      return;
    }

    // 4. Use LLM to generate response based on context and query
    console.log('Generating response with LLM...');
    const prompt = `Based on the following context, answer the query:\n\nContext:\n${context}\n\nQuery: ${query}\n\nAnswer:`;

    if (!Settings.llm) {
      throw new Error("LLM is not configured in Settings.");
    }

    const response = await Settings.llm.complete({ prompt: prompt });

    console.log("\nLLM Response:");
    console.log(response.text);

    console.log("\nRetrieved Source Files:");
    similarFiles.forEach((file, i) => {
      console.log(`- ${file.filepath} (Score: ${file.score.toFixed(4)})`);
    });

  } catch (error: unknown) { // Add a catch block
    console.error("An error occurred during RAG execution:", error);
  }
}
