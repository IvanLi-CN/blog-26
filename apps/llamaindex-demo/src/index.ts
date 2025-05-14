import { initializeDB, closeDB } from './db.js';
import { processFilesAndVectorize } from './vectorizer.js';
import { testRAG } from './rag.js';

async function main() {
  const args = process.argv.slice(2); // Remove node executable and script path

  let ragQuery: string | null = null;

  if (args.includes('--rag-query')) {
    const queryIndex = args.indexOf('--rag-query');
    if (queryIndex + 1 < args.length) {
      ragQuery = args[queryIndex + 1];
    } else {
      console.error("Error: --rag-query option requires a query string.");
      process.exit(1);
    }
  }

  try {
    await initializeDB();

    if (ragQuery) {
      await testRAG(ragQuery);
    } else {
      console.log("Starting indexing process...");
      await processFilesAndVectorize();
      console.log("Indexing process finished.");
    }

  } catch (error) {
    console.error("An error occurred in the main process:", error);
    process.exitCode = 1; // Indicate an error exit
  } finally {
    try {
      await closeDB();
    } catch (dbCloseError) {
      console.error("Error closing the database:", dbCloseError);
      // Potentially set exit code if not already set, or just log
      if (process.exitCode === undefined || process.exitCode === 0) {
         process.exitCode = 1;
      }
    }
  }
}

main().then(() => {
  if (process.exitCode === 1) {
    console.log("Process finished with errors.");
  } else {
    console.log("Process finished successfully.");
  }
}).catch(e => {
    // This catch is for unhandled promise rejections from main itself,
    // though the try/catch/finally inside main should handle most.
    console.error("Unhandled error in main execution:", e);
    process.exit(1); // Ensure non-zero exit code for unhandled errors
});