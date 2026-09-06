# Implementation

- Lifecycle: active
- Implementation: in progress

Release intent, component-aware versioning, EdgeOne Makers/backend/image publishing, unified runtime packaging, and managed PR receipts are implemented through the label-driven release workflow. Stable frontend releases package the verified `site-dist` output with Makers Edge Functions, reconcile the Maker's server-side `BLOG_BACKEND_ORIGIN` variable through the official CLI in a runner-local temporary directory, and publish to EdgeOne Makers; RC releases do not replace the production frontend host. The release source is the exact current `main` head, which is checked before release intent can create any output. GitHub-side required-check configuration remains an operational prerequisite.
