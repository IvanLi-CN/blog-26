# History

## Initial Cleanup

- Created this spec as the successor to `cbwu4`.
- Classified `cbwu4` as the completed production-runtime reduction phase and moved the repository-wide cleanup into this owning spec.
- Removed active Next runtime ownership from scripts, gateway routing, source tree, Docker runtime config, and current docs.
- Added explicit production gating for dev/test compatibility routes during review convergence.
- Preserved `/rss.xml` as a gateway-owned redirect to `/feed.xml` during review convergence.
- Updated CI/release workflows so Docker smoke and release configuration use the zero-Next runtime contract.
