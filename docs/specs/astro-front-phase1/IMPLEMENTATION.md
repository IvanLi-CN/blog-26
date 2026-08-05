# Implementation

- Lifecycle: archived
- Implementation: implemented

Astro owns visitor-facing routes, public interactions use `/api/public/*`, and the release image serves the public build through the gateway while retaining the transitional internal runtime required at delivery time. Build, E2E, and single-image smoke validation completed.
