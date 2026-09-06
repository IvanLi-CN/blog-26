# Implementation

- Lifecycle: active
- Implementation: in progress

Release intent, component-aware versioning, EdgeOne Makers/Pages/backend/image publishing, unified runtime packaging, and managed PR receipts are implemented through the label-driven release workflow. Stable frontend releases publish one verified `site-dist` artifact to EdgeOne Makers and GitHub Pages; RC releases do not replace either production frontend host. The release source is the exact current `main` head, which is checked before release intent can create any output. GitHub-side required-check configuration remains an operational prerequisite.
