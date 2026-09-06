# History

- The release contract evolved from component-specific artifacts to a unified image with independent frontend and backend release outputs.
- Stable frontend releases package the verified static output with Makers proxy functions and publish only to EdgeOne Makers; the historical GitHub Pages deployment is no longer updated.
- Stable EdgeOne releases reconcile the server-side proxy origin through the official CLI, using runner-local project metadata rather than static frontend output.
- Managed release receipts were added as best-effort reporting and deliberately do not determine release success.
- Release sourcing is constrained to the exact current `main` head so manual dispatches cannot publish a topic-branch or stale commit.
