# Tantivy matching validation

This is a validation-only corpus and harness, not a product implementation. Native execution completed on the parent-owned Agent VM after a third acquisition succeeded: Debian 13.7, Linux x86_64, Rust/Cargo 1.91.0, Tantivy 0.26.2. The two earlier guest-agent timeouts did not run guest commands. The parent completed the shared workspace build, and this harness subsequently rebuilt only its own package with `cargo build --locked --jobs 2 --package tantivy-matching-validation` to add independent boolean/field assertions. Both native executions completed without panic; the retained [native-results.txt](./native-results.txt) contains the final stdout/stderr, including every semantic FAIL. No host Rust build, application body post-filter, custom tokenizer, or homemade inverted index was used.

## Reproduction

From the repository root: `bun docs/specs/search-relevance/validation/tantivy/matching/sqlite-near.ts`. In an authorized environment, run `cargo build --locked --workspace --jobs 2` from the validation workspace, then `cargo run --locked --package tantivy-matching-validation`. The shared Cargo.lock is retained at the workspace root, so initial reproduction also uses `--locked` without resolving a new dependency set. The parent supplies the SSH config and manages the VM lease; this harness must not acquire, renew, or release a separate VM. The actual native command was `target/debug/tantivy-matching-validation > matching/native-results.txt 2>&1` on the VM, followed by copying that exact evidence file back to this directory.

## SQLite baseline: executed

The retained [sqlite-near.txt](./sqlite-near.txt) was produced on the macOS host by Bun 1.4.2 with SQLite 3.51.0; it is a lightweight real SQLite baseline, separate from the Linux native run. It imports the actual `parseSearchQuery` from `src/lib/search/query.ts` and creates an FTS5 table using the `trigram` tokenizer in `drizzle/0010_search_full_text_fallback.sql`. All measured NEAR expressions are `advanced-valid` and use the product's rendered FTS query, not an approximate SQL replacement.

The parent also executed the same script with the actual product parser in the Linux VM mirror at `/workspace/tantivy-project`; execution exited 0 and the retained [sqlite-near-linux.txt](./sqlite-near-linux.txt) reports Bun 1.4.2 with SQLite 3.53.2. Python JSON comparison confirms all 28 query records (mode, rendered query and rows) are identical to the macOS SQLite 3.51.0 baseline. The shared Bun version does not imply an identical SQLite version; both actual platform/runtime versions are recorded, and the measured NEAR conclusion remains unchanged.

| Query | Actual evidence |
| --- | --- |
| `NEAR(alpha beta, 0)` through distance 2 | Empty, even for `alpha beta` |
| `NEAR(alpha beta, 3)` | `alpha beta` and reversed `beta alpha` |
| `NEAR(abc def, 3)` | `abc def` and `abcXdef`, not `abcXXdef` |
| `NEAR(abc def, 4)` | Adds `abcXXdef` |
| `NEAR(甲乙丙 丁戊己, 2)` | Consecutive `甲乙丙丁戊己` and reversed `丁戊己甲乙丙` |
| `NEAR(甲乙丙 丁戊己, 3)` | Adds `甲乙丙。丁戊己` |
| `NEAR(甲乙丙 丁戊己, 4)` | Adds `甲乙丙中间丁戊己` |
| `NEAR(Arch SQLite, 4)` | `Arch中文SQLite` |
| `NEAR(Arch SQLite, 8)` | Adds `中文Arch-中文SQLite` and `中文Arch......SQLite` |

These actual results establish that the existing NEAR contract is not whitespace-delimited word distance and is not ordered adjacency. A Tantivy compatibility layer must preserve trigram-position distance and unordered grouping; interpreting the existing integer directly as a word-token PhraseQuery slop would silently change the contract. The native comparison below confirms incompatible distance semantics for the measured configurations.

## Native matching results

The corpus covers ASCII boundary rejection (`archive`, `search`, `aarch64`, `ArchLinux`, `arch_linux`), acceptable punctuation and Chinese/ASCII boundaries, continuous versus separated Chinese fragments, C/C++/C# and version suffixes, Node.js versus Node js, SQLite versus SQLite3, a first invalid `archive` followed by valid `Arch`, the non-continuous `文。章`, `文 章`, `文-章` negatives, and repeated invalid substring documents competing with valid matches before a top-3 truncation. `TRUNCATION` logs intersect actual native top results with fixed expected identities for diagnostics only; this is not proposed as a production filter.

The harness compares the default tokenizer, RegexTokenizer preserving ASCII letters/digits/underscore/plus/hash and internal periods, a split-period RegexTokenizer variant, a separator-preserving RegexTokenizer (`[A-Za-z0-9_+#]+|(?s:.)`), and fixed 1-gram/3-gram NgramTokenizer configurations. This intentionally exposes the tradeoff between preserving `Node.js` as an exact token and allowing `Node` to retrieve it, and between character substring coverage and actual token positions. No all-body scan, homemade inverted index, or custom tokenizer is used.

Native parser probes cover ordinary terms with conjunction configured as the default, quotes, fields, AND/OR/NOT, `arch*`, and NEAR. Printed parse success alone is not evidence that semantics match the controlled AST: AST debug output and result identities must be assessed. Native errors likewise distinguish unsupported grammar from tokenization failure. The controlled AST, invalid-syntax literal retry, NFKC query normalization, short-query handling, and budget enforcement remain application-layer responsibilities; this harness does not claim to implement the entire compiler.


Each configuration executes 24 exact expected-versus-actual assertions. Query parser errors are reported separately and are not counted as successful assertions.

| Configuration | PASS | FAIL | Native parse errors | Finding |
| --- | ---: | ---: | ---: | --- |
| default | 11 | 13 | 2 | Misses mixed Chinese/ASCII boundaries and short Chinese; matches arch_linux and conflates C/C++/C# and Node.js/Node js |
| regex | 20 | 4 | 2 | ASCII name/symbol boundaries work, but Node misses Node.js and 文章 incorrectly matches all three punctuation/space-separated negatives |
| regexSplitDot | 19 | 5 | 2 | Node works, but Node.js also matches Node js; Chinese continuity still fails |
| regexKeepSeparators | 24 | 0 | 2 | All measured literal/phrase/field/boolean expectations pass; native prefix and NEAR syntax still incompatible |
| ngram1 | 13 | 11 | 1 | All tokens have position 0; substring and non-continuous Chinese false positives; quoted phrase order/spacing unreliable |
| trigram | 13 | 11 | 1 | All tokens have position 0; misses short names/Chinese, admits ASCII substrings and version suffixes |

The separator-preserving built-in configuration is a positive capability result, not proof of every requirement or an adoption recommendation. It preserves `.` as a token between `node` and `js`, distinguishes `Node.js` from `Node js`, preserves spaces/punctuation between Chinese characters, and makes `PhraseQuery(文,章)` slop 0 match only document 9. The other Regex variants incorrectly include documents 42–44 at slop 0. It also retrieves a valid later `Arch` after the first invalid `archive` in document 20. The finite matrix does not establish production index size, performance, Unicode edge handling, aliases, all field/boolean permutations, or full AST/budget compatibility.

### Prefix and grammar

Native `arch*` is not the controlled prefix syntax: default/regex/regexSplitDot produce a plain `TermQuery("arch")`, missing `architecture`; regexKeepSeparators produces a literal `PhraseQuery("arch", "*")` and returns nothing. Native `"arch"*` errors for the four name-token configurations because its PhrasePrefixQuery requires at least two tokens. For Ngram it creates a PhrasePrefixQuery with default `max_expansions: 50`, but does not establish ASCII word-start boundaries: trigram admits `search` and `aarch64`.

An explicit built-in `RegexQuery::from_pattern("arch.*", body)` with the three RegexTokenizer configurations returns exactly the fixed expected word-start set, including `architecture` and excluding `search`/`aarch64`. Therefore prefix is achievable in this corpus using a real built-in query, but requires the controlled AST compiler to map the existing prefix node to it; raw user syntax cannot be forwarded unchanged. This harness's ASCII-only pattern is a demonstration, not an implementation of arbitrary escaped prefix/phrase-prefix syntax.

The parser is configured with `set_conjunction_by_default()` because the product requires ordinary multiword AND. Explicit AND/OR/NOT and field restriction pass the separator-preserving matrix, including separate alpha-only and beta-only documents. Every configuration rejects `NEAR(alpha beta, 1)` as a native syntax error. Product NFKC, invalid-syntax literal retry, short operand restrictions, AST precedence and budgets must remain in the existing controlled parser or an explicit compatibility compiler.

### NEAR versus PhraseQuery slop

Actual default PhraseQuery(alpha,beta) slop 0 matches `alpha beta`; slop 1 also matches `alpha enormousgap beta`, treating the entire long middle word as one token; slop 2 adds reversed `beta alpha`. SQLite trigram NEAR needs distance 3 even for the adjacent/spaced pair, treats forward and reverse alike, and only includes the long middle word at the measured distance 16. A single copied distance cannot preserve these results.

The trigram tokenizer cannot serve as a drop-in position-compatible replacement: its log shows every token at position 0. Explicit PhraseQuery(abc,def) slop 1 matches all of `abcXYZdef`, reversed `defXYZabc`, `abc def`, `abcXdef` and `abcXXdef`; SQLite distance 3 matches only `abc def`/`abcXdef`, distance 4 adds `abcXXdef`, and distance 8 adds the two XYZ examples. The separator-preserving tokenizer also has mixed units: ASCII names are one token while Chinese and separators are individual tokens, so it does not inherit FTS5 trigram positions.

Preserving NEAR therefore needs an explicitly verified positional representation/query execution path, including unordered groups, multiple atoms and phrases; the literal-passing Regex configuration alone does not solve it. This harness does not implement that compatibility layer and does not claim the migration is complete.

### Truncation

The actual Ngram top-3 results demonstrate the forbidden candidate-first truncation: ngram1 returns `[41,37,38]` and trigram `[41,4,3]`, but only identity 41 is a legal literal Arch hit. The full expected legal set has eight identities. Filtering only that initial top 3 would leave one result while omitting available legal results; no such filter was used to turn the assertions green. The Regex configurations return legal top-3 candidates for this corpus. This demonstrates the risk and a positive finite example, not a universal completeness or pagination guarantee.
