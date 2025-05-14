# Markdown Vectorization and RAG with LlamaIndex

This project demonstrates how to vectorize Markdown files from a specified directory, store their metadata and hashes in an SQLite database, and perform Retrieval Augmented Generation (RAG) queries using LlamaIndex with a Bun runtime.

It features an incremental indexing mechanism, only processing new or modified files, and handles file deletions by removing them from the index and database.

## Environment Requirements

-   **Bun**: This project is built to run with Bun. Ensure you have Bun installed. ([Installation Guide](https://bun.sh/docs/installation))

## Installation

1.  **Clone the repository (if you haven't already).**
2.  **Navigate to the project directory:**
    ```bash
    cd apps/llamaindex-demo
    ```
3.  **Install dependencies:**
    ```bash
    bun install
    ```

## Configuration

1.  **Create a `.env` file** in the `apps/llamaindex-demo` directory by copying the example or creating it manually:
    ```bash
    cp .env.example .env 
    ```
    If `.env.example` does not exist, create `.env` with the following content:

    ```env
    OPENAI_API_KEY="your_openai_api_key_here"
    OPENAI_API_BASE_URL="your_custom_openai_compatible_api_url_here"
    ```

2.  **Fill in your API credentials**:
    *   `OPENAI_API_KEY`: Your API key for the OpenAI compatible service.
    *   `OPENAI_API_BASE_URL`: The base URL for your OpenAI compatible API endpoint.

3.  **Models Used**:
    *   **Embedding Model**: `text-embedding-3-small` (via OpenAI compatible API)
    *   **LLM for RAG**: `o4-mini` (via OpenAI compatible API)

    These are configured within the application code and utilize the API key and base URL from your `.env` file.

## Running the Application

### 1. Indexing Markdown Files

This process will scan the `apps/web/src/content/post` directory (relative to the monorepo root), vectorize new or updated Markdown files, and store their information.

```bash
bun start
```

Or, for development with auto-reloading on file changes (within `apps/llamaindex-demo/src`):

```bash
bun run dev
```

The first run might take some time depending on the number and size of your Markdown files. Subsequent runs will be faster due to incremental indexing.
Vector index data will be persisted in the `apps/llamaindex-demo/storage` directory.
File metadata will be stored in `apps/llamaindex-demo/sqlite.db`.

### 2. Testing RAG (Retrieval Augmented Generation)

After indexing, you can test the RAG functionality by asking questions based on your Markdown content.

Use the `rag` script followed by your query. Make sure to enclose your query in quotes if it contains spaces:

```bash
bun run rag -- "What is this project about?"
```
or
```bash
bun src/index.ts --rag-query "Tell me about Arch Linux setup."
```

The application will load the index, retrieve relevant documents, and use the LLM to generate an answer.

## Project Structure

```
apps/llamaindex-demo/
├── src/
│   ├── db.ts           # SQLite database interactions
│   ├── fileProcessor.ts # Markdown file scanning and metadata extraction
│   ├── index.ts        # Main application entry point (CLI)
│   ├── rag.ts          # RAG testing logic
│   └── vectorizer.ts   # LlamaIndex setup, vectorization, and indexing logic
├── storage/            # Persisted LlamaIndex vector store data (auto-created)
├── .env                # Environment variables (API keys, etc. - GITIGNORED)
├── .gitignore
├── package.json
├── README.md           # This file
├── sqlite.db           # SQLite database file (auto-created)
└── tsconfig.json
```

## How Incremental Indexing Works

-   **File Scanning**: On each run, all Markdown files in the target directory are scanned.
-   **Hashing**: A SHA256 hash of each file's content is calculated.
-   **Database Check**:
    -   The application checks an SQLite database for a record of each file (by its relative path).
    -   If a file is new, or if its content hash or last modified time differs from the stored record, it's marked for re-indexing.
-   **LlamaIndex Update**:
    -   For new/modified files, the old version (if any) is removed from the LlamaIndex vector store.
    -   The new/updated file content is loaded, converted into a LlamaIndex `Document`, and inserted into the vector store.
    -   The corresponding record in the SQLite database is updated with the new hash, modified time, and indexing time.
-   **Deletion Handling**:
    -   Files present in the database but no longer found in the file system are removed from both the LlamaIndex vector store and the SQLite database.
-   **Persistence**: The LlamaIndex vector store is persisted to the `./storage` directory, allowing it to be reloaded on subsequent runs.
