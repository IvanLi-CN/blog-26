#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import path from "node:path";

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH ?? "./dev-data/sqlite.db");

const CATEGORIES = [
  {
    key: "frontend",
    title: "Frontend",
    tags: ["Next.js", "React Server Components", "Tailwind", "Shadcn", "DaisyUI", "Motion"],
  },
  {
    key: "backend",
    title: "Backend",
    tags: ["Drizzle", "Prisma", "tRPC", "Bun Runtime", "Node Cluster", "GraphQL Federation"],
  },
  {
    key: "devops",
    title: "DevOps",
    tags: ["Podman", "Quadlet", "GitHub Actions", "ArgoCD", "Kubernetes", "Fly.io"],
  },
  {
    key: "hardware",
    title: "Hardware",
    tags: ["STM32", "USB-PD", "ChargePump", "MOSFET", "INA231", "LM5176"],
  },
  {
    key: "ai",
    title: "AI",
    tags: ["OpenAI", "Claude", "Gemini", "Prompt Engineering", "Embedding", "RAG"],
  },
  {
    key: "lifestyle",
    title: "Lifestyle",
    tags: ["Mechanical Keyboard", "Ergonomic Chair", "E-Ink", "Japanese", "Travel", "Photography"],
  },
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const db = new Database(DB_PATH);
const now = Math.floor(Date.now() / 1000);

db.run("BEGIN");

for (const category of CATEGORIES) {
  for (const tag of category.tags) {
    const slug = slugify(`${category.key}-${tag}`) || `${category.key}-${Date.now()}`;
    const postId = `demo-${slug}`;
    const tagsJson = JSON.stringify([tag]);
    db.run(
      `INSERT INTO posts (
        id, slug, type, title, excerpt, body, publish_date, update_date,
        draft, public, category, tags, author, image, metadata,
        data_source, content_hash, last_modified, source, file_path
      ) VALUES (
        ?, ?, 'post', ?, ?, ?, ?, ?, 0, 1, ?, ?, 'Demo', NULL, NULL,
        'local', ?, ?, 'local', ?
      ) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        excerpt=excluded.excerpt,
        body=excluded.body,
        publish_date=excluded.publish_date,
        update_date=excluded.update_date,
        tags=excluded.tags,
        content_hash=excluded.content_hash,
        last_modified=excluded.last_modified;
      `,
      [
        postId,
        slug,
        `${tag} 实验记录`,
        `Demo content for ${tag}.`,
        `## ${tag}\n\nThis is demo content to showcase responsive tag layout.`,
        now,
        now,
        category.title,
        tagsJson,
        `hash-${postId}`,
        now,
        `demo/${slug}.md`,
      ]
    );

    db.run(
      `INSERT INTO tags (id, category_key, category_title, icon, description, post_count, memo_count, created_at, updated_at)
       VALUES (?, ?, ?, NULL, '', 0, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET category_key=excluded.category_key, category_title=excluded.category_title, updated_at=excluded.updated_at;
      `,
      [tag, category.key, category.title, now, now]
    );
  }
}

db.run("COMMIT");
console.log(`Seeded demo tags into ${DB_PATH}`);
