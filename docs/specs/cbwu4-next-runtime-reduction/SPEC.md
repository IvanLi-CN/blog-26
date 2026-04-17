# SPEC: Next runtime reduction after admin SPA migration

- Spec ID: `cbwu4`
- Status: `ready`
- Owner: `main-agent`

## 1. Background

`phgpd` moved the public site to Astro, and `8amg2` moved `/admin/*` to the gateway-owned admin SPA. The repo still depends on an internal Next runtime for legacy APIs, preview flows, dev/test/demo pages, and a few compatibility-only browser contracts.

Those remaining ownership islands are now the primary blocker for shrinking the internal Next runtime without breaking stable public/admin contracts.

## 2. Goals

1. Freeze a complete inventory of the remaining routes and contracts that still require the internal Next runtime.
2. Define the migration order needed to reduce Next ownership without regressing the Astro public site or the admin SPA.
3. Move browser-visible legacy contracts onto explicit gateway or compatibility HTTP surfaces before any runtime removal.
4. Keep the final zero-Next production runtime cleanup out of scope until the replacement contracts are proven.

## 3. Non-goals

- No removal of the internal Next runtime in this planning spec alone.
- No Rust-native reimplementation of the compatibility APIs in the same phase.
- No changes to the current Astro public ownership or the `apps/admin` SPA ownership.
- No broad cleanup of internal-only tooling pages unless their replacement path is defined in this spec.

## 4. Scope

### In scope

- Remaining route ownership under the internal Next runtime:
  - `/_next/*`
  - `/api/*` except `/api/public/*`, `/api/admin/*`, and `/api/health`
  - `/mcp`
  - `/dev/*`
  - `/theme-test`
  - `/test-editor`
  - `/demo-integration`
  - `/demo-memo-card`
  - admin preview requests on `/posts/*` and `/memos/*` with `?admin-preview=1`
  - memos admin flows that still depend on `/api/trpc/memos.*`
- Migration sequencing for the remaining browser/API contracts.
- Explicit documentation of which contracts must move before the internal Next runtime can shrink further.

### Out of scope

- Direct implementation of the follow-up migrations.
- Deleting `/api/files/*` or `/api/trpc/*` before their replacements are defined and validated.
- Consolidating every legacy contract into one release unless the ownership matrix proves it is safe.

## 5. Current Ownership Matrix

| Route family | Current owner | Required follow-up |
| --- | --- | --- |
| `/_next/*` | internal legacy Next | Remove once no shipped surface or preview flow depends on Next assets |
| `/api/*` except `/api/public/*`, `/api/admin/*`, `/api/health` | internal legacy Next | Split into explicit gateway or successor compatibility handlers by domain |
| `/mcp` | internal legacy Next | Decide whether it remains in the Next-owned process or moves behind the gateway/runtime successor |
| `/dev/*`, `/theme-test`, `/test-editor`, `/demo-*` | internal legacy Next | Retire, replace, or isolate from the production runtime boundary |
| `/posts/*?admin-preview=1`, `/memos/*?admin-preview=1` | gateway -> internal legacy Next preview path | Define an explicit preview contract that does not depend on the broad legacy page layer |
| memos admin mutations via `/api/trpc/memos.*` | internal legacy Next + tRPC | Replace with an explicit compatibility surface before runtime removal |

## 6. Migration Order

1. Freeze and validate the remaining browser-visible contracts: admin preview, memos admin mutations, and any legacy API families still called from shipped surfaces.
2. Introduce explicit successor contracts for the browser-visible leftovers before touching the internal runtime boundary.
3. Isolate internal-only tooling pages and decide whether they are retired, replaced, or kept behind a non-production-only path.
4. Re-evaluate the remaining `/_next/*`, `/mcp`, and legacy API ownership after steps 1-3 are proven stable.
5. Only then plan the final production-runtime removal or replacement of the internal Next process.

## 7. Acceptance Criteria

1. Every remaining Next-owned route family is listed with a current owner and a follow-up action.
2. The spec makes it explicit that memos admin `/api/trpc/memos.*` and admin preview are next-phase runtime blockers, not unresolved defects in `8amg2`.
3. The migration order prevents removal of the internal Next runtime before browser-visible compatibility contracts are replaced.
4. The spec can be used as the sole planning entry for the next runtime-reduction implementation phase.

## 8. Validation

- Inventory verified against `scripts/start-gateway.ts`, `src/app/api/**`, `src/proxy.ts`, and the remaining Next-owned test coverage.
- `8amg2` closeout verified that `/admin/*` no longer depends on `src/app/admin/**` or `src/components/admin/**`.

## 9. Milestones

- [ ] M1: Freeze the remaining Next ownership inventory and successor contracts.
- [ ] M2: Migrate browser-visible legacy contracts (admin preview, memos admin APIs) off broad Next ownership.
- [ ] M3: Isolate or retire internal-only tooling/demo routes.
- [ ] M4: Re-assess whether the internal Next runtime can shrink further or be removed from production topology.

## 10. Approach

- Treat `8amg2` as closed: no Phase 2 scope is reopened to absorb runtime-reduction work.
- Migrate the highest-risk browser-visible contracts first, not the lowest-level runtime shell.
- Keep the gateway as the ownership boundary for public/admin surfaces while the legacy runtime is reduced behind it.
- Record replacement contracts before removing legacy paths so validation can stay deterministic.
