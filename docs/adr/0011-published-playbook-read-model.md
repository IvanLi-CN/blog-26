---
status: accepted
---

# Follow the Blog's Published Style Playbook Edition in Console

The blog presents Style Playbook as a native reading collection of public Topics, project experience snapshots, and Policy Skills. Its build consumes a versioned public export from an upstream stable Release, and a successful static deployment publishes both the pages and the public data for that edition. Console follows this deployed edition through a persisted local cache, accepting roughly five minutes of synchronization delay under healthy, compatible conditions and retaining the last successful edition when refresh fails.

## Considered Options

- **Console independently follows the latest upstream stable Release**: it can update sooner, but the two reading surfaces can present different editions after a failed or delayed blog deployment.
- **Console reads upstream on each request**: this introduces an external availability and authentication boundary into page rendering; the upstream repository is private, while its sanitized public export can be served without GitHub credentials.
- **Reuse the existing article/Memo public snapshot for Playbook**: the blog already refreshes that snapshot from console, so making console's Playbook data depend on the same snapshot would complicate the direction of publication.

## Consequences

- The upstream repository remains the knowledge source; the blog's successful deployment determines the published edition followed by console. Console renders from the public data contract rather than scraping the static HTML.
- Playbook data, details, and search share one edition identity and switch together. Console performs refresh in the background; page rendering uses the validated local cache. Both sites expose the edition being read.
- Article and Memo data retain the live console behavior defined by ADR 0010. The published-edition boundary applies specifically to the Playbook collection.
- Playbook has a separate content input and update workflow. A content-only refresh does not create an application release or rebuild the console image; ordinary frontend releases preserve the adopted Playbook edition after checking compatibility.
- Code and content deployments share a production serialization boundary. Duplicate or late events cannot silently downgrade the edition; explicit rollback checks renderer compatibility and uses a retained release package.
- Only the upstream public export enters pages, data files, or search. Credentials for reading the private source remain within CI.

Detailed requirements and operational constraints are recorded in the [Style Playbook integration specification](../specs/style-playbook-integration/SPEC.md).
