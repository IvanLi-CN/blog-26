# Implementation

- Lifecycle: active
- Implementation: in progress

Release intent, component-aware versioning, EdgeOne Makers/backend/image publishing, unified runtime packaging, and workflow publication summaries are implemented through the label-driven release workflow. Stable frontend releases package the verified `site-dist` output with Makers Edge Functions, reconcile the Maker's server-side `BLOG_BACKEND_ORIGIN` variable through the official CLI in a runner-local temporary directory, and publish to EdgeOne Makers; RC releases do not replace the production frontend host. The release source is the exact current `main` head, which is checked before release intent can create any output. The CI candidate no longer treats `bun outdated` freshness results as a blocking gate; frozen installation and functional quality gates remain blocking. GitHub-side required-check configuration remains an operational prerequisite. The release-owning agent reports the workflow's actual publication outcome to the owner rather than writing a result comment to the source PR.

Public snapshot preparation now runs once per expected release before frontend and image publishing. It validates the snapshot, records its generation time, counts, and SHA-256, and shares it through a short-lived workflow artifact. Content fetches use HTTP/1.1 with bounded retries; matching bundle/live endpoint paths avoid a duplicate request when only recognized credential parameters differ.
