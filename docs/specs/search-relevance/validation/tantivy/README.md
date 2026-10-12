# Tantivy component validation

This workspace is an isolated validation artifact, not a production search module. It contains synthetic documents only and does not modify the application's search implementation, database or deployment.

| Package | Question |
| --- | --- |
| `tantivy-bun-probe` | Can the pinned Bun runtime load a native Tantivy addon and execute disk-backed, asynchronous search? |
| `tantivy-matching-validation` | Which confirmed matching and query requirements do built-in tokenizer/query configurations actually satisfy? |
| `tantivy-sync-validation` | Can a project-owned SQLite outbox synchronize committed Tantivy state and recover replay/termination windows? |

The root workspace pins Tantivy 0.26.2, napi 3.14.2, napi-derive 3.6.12, napi-build 2.6.0 and rusqlite 0.40.2; Cargo.lock preserves the actual dependency resolution. Sources and actual text logs are retained. Bun native execution and the synthetic recovery probe passed; the matching matrix found a passing literal configuration and incompatible native grammar/NEAR. Read each report and the parent summary for the precise limits.

## Runtime boundary

The project release policy and product builder explicitly target `linux/amd64` in `src/lib/release/policy.ts` and `src/lib/release/products.ts`. A macOS arm64 run, if explicitly authorized, proves only that platform. Node-API compatibility does not remove the need for target-specific native builds and loader checks.

Heavy compilation and integration execution used the session-owned Agent VM. The initial two acquire attempts failed waiting for the guest agent. After the owner requested a retry, acquire succeeded for the same VM at generation 3. Actual builds and runs used Debian 13.7 x86_64 Linux, Rust/Cargo 1.91.0 and Bun 1.4.2. The probe programs and the product-parser SQLite baseline ran on Linux; no host native compilation or infrastructure repair was performed. No host exception was needed.

## Reproduction

Run these commands from this validation workspace in the authorized environment. The saved Cargo.lock allows the initial reproduction build to use `--locked`; the first original run generated it before the saved successful locked build. Keep compilation bounded to two jobs.

```sh
cargo build --locked --workspace --jobs 2
cargo run --locked --package tantivy-matching-validation
cargo run --locked --package tantivy-sync-validation
```

For the bridge, copy the built library to `bun-bridge/tantivy_bun_probe.node`: Linux uses `target/debug/libtantivy_bun_probe.so`; macOS uses `target/debug/libtantivy_bun_probe.dylib`. Then run `bun verify.mjs` from `bun-bridge`. The test creates and deletes only its exact temporary index directory.

The SQLite baseline imports the existing controlled parser. Run it from the repository root:

```sh
bun docs/specs/search-relevance/validation/tantivy/matching/sqlite-near.ts
```

## Reports

- [Bun bridge](./bun-bridge/bridge-report.md)
- [Matching and query semantics](./matching/matching-report.md)
- [Persistence and synchronization](./sync/persistence-report.md)
