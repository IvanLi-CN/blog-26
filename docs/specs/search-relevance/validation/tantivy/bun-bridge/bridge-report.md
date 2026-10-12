# Bun Node-API validation

## Scope and status

Validation-only probe uses Tantivy 0.26.2, napi 3.14.2, napi-derive 3.6.12 and napi-build 2.6.0. The owner-requested retry acquired the parent-owned Agent VM at generation 3 after two earlier guest-agent timeouts. The parent built the workspace with Rust/Cargo 1.91.0 and two jobs; the successful retry produced the native library. `bun verify.mjs` passed with exit 0 on Bun 1.4.2, Debian 13 x86_64 (`x86_64-unknown-linux-gnu`). No host native build or macOS runtime validation was performed.

The current release product target is explicitly `linux/amd64` in `src/lib/release/policy.ts` and `src/lib/release/products.ts`. Darwin arm64 development validation, if separately authorized, would not validate this Linux release artifact. Parent-provided crates.io package metadata records minimum Rust versions of 1.86 for Tantivy and 1.88 for napi/napi-derive/napi-build; the reported host compiler 1.91.0 satisfies these compiler requirements but does not prove native build or runtime compatibility.

## Observed results

The disk-backed Tantivy retrieval, incremental additions, committed upsert removing old terms, stored Unicode fields, controlled invalid syntax/limit/id/type errors, async rejection, explicit close rejection and same-directory reopen assertions passed. During 20,000 actual native queries, the async task ran for 6,403.89 ms while a 1 ms Bun interval progressed 4,680 times; this demonstrates event-loop progress for this workload rather than a throughput benchmark. The first native `require` took 3.17 ms in a fresh Bun process; OS cache was not cleared. All synchronous error classes were `Error`, including wrong JS object-to-string conversion; the runtime did not report `TypeError` for that conversion. The process remained usable after each controlled error.

Evidence is retained in [runtime.txt](./runtime.txt), [environment.txt](./environment.txt) and [abi.txt](./abi.txt). The `file` utility was unavailable in the VM and is recorded as such; `readelf` independently confirms an ELF64 x86-64 shared object. `ldd` shows dependencies on libgcc_s, libm, libc and the GNU/Linux dynamic loader; the version-needs section includes symbols up to GLIBC_2.34. The Rust bridge enables napi8 while Bun reports Node-API 10. The compiled addon SHA-256 is `0765b5a97c485e5f1b8e3328507a0351b90d520bc4499ae1f8b482a92abef344`. Full workspace build logs are parent-owned alongside the root report. A preliminary attempt before the successful workspace build found no `.so`; its missing-module diagnosis was not a native compatibility result.

This is a Linux development-artifact pass, not a shipped Docker image/release pass. The exact current `oven/bun:1-slim` image and its libc compatibility were not tested; the addon must be built against or checked within the release runtime. Darwin arm64 remains untested.

## Contract

`SearchIndex(path)` creates or opens a disk index, holds one writer, exposes `upsert(id, title, body)`, `commit()`, synchronous `query(query, limit)`, worker-pool `queryAsync(query, limit, repetitions)`, and explicit `close()`. Upsert uses Tantivy term deletion and document addition, commit explicitly reloads a manual reader, and close joins merge threads and releases the writer lock. The async probe repeats actual Tantivy search work; repetitions are instrumentation, not a proposed product API. Hits contain score and stored JSON documents. JS wrong types use napi conversion errors; invalid limits/IDs/paths and query parse failures return controlled errors.

## Reproduction

From the validation workspace in an authorized environment, initial `cargo build --workspace --jobs 2` resolves dependencies and creates the workspace Cargo.lock. Subsequent bridge rebuilds use `cargo build --locked --package tantivy-bun-probe --jobs 2`. On Linux copy `target/debug/libtantivy_bun_probe.so` to `bun-bridge/tantivy_bun_probe.node`; on separately authorized macOS development runs the source filename is `target/debug/libtantivy_bun_probe.dylib`. Run `bun verify.mjs` from `bun-bridge`, redirecting complete build and runtime output to logs. Record `uname -a`, `rustc --version`, `cargo --version`, `bun --version`, target triple and native dynamic dependencies alongside those logs (`ldd` for Linux, `otool -L` for macOS). The JS test creates a private temporary directory and removes only that exact directory after closing the index. The observed run used `/workspace/tantivy-validation/tantivy` in the session VM and the parent-built artifact, without triggering another compile.

The cold-load metric measures the first `require` in one new Bun process; it is not an OS page-cache cold benchmark. Wrong JS argument types log the actual error class rather than assuming `TypeError`.

## Packaging implications

The current Dockerfile builds via Bun images and has no Rust compiler stage. Its image-built and prebuilt paths copy `backend-dist` into the runtime image. `scripts/prepare-backend-dist.sh` copies JS/TS source, scripts and assets; it has no native library artifact collection. Adopting this approach requires a Rust build stage or separately verified native artifacts, target-specific `.node` dispatch, explicit inclusion in backend distribution, matching libc/architecture in container builds and prebuilt releases, and native loader smoke tests. Node-API stabilizes the JS ABI but does not turn a Linux ELF library into a macOS Mach-O library or eliminate libc compatibility requirements. The index path must be a writable persistent path alongside SQLite; writer exclusivity, orderly shutdown, index migration/rebuild and background-job lifecycle still need product integration. This probe does not establish production throughput, memory use, crash recovery or every release target.

## Primary sources

- [Tantivy 0.26.2 crate API](https://docs.rs/tantivy/0.26.2/tantivy/): disk indexing, explicit commit and score-ordered TopDocs retrieval.
- [NAPI-RS AsyncTask](https://napi.rs/docs/concepts/async-task): compute runs in a native worker pool and resolve converts output on the JS thread.
- [Bun Node-API](https://bun.sh/docs/runtime/node-api): Bun native-addon loading support; actual compatibility must be exercised for the pinned runtime and addon.
