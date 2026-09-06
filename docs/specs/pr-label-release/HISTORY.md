# History

- The release contract evolved from component-specific artifacts to a unified image with independent frontend and backend release outputs.
- Stable frontend releases share one verified static artifact between EdgeOne Makers and GitHub Pages, while GitHub Pages remains the hot-standby publisher.
- Managed release receipts were added as best-effort reporting and deliberately do not determine release success.
- Release sourcing is constrained to the exact current `main` head so manual dispatches cannot publish a topic-branch or stale commit.
