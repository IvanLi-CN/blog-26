# Admin Soft UI Redesign History

- Created the `sftui` spec to track the full admin Soft UI redesign and approved UI library policy.
- 2026-06-09: Refined the editor failure path so empty new-post saves show a friendly banner instead of raw validation JSON, while preserving the server-side non-empty body contract.
- 2026-06-14: Reworked the WYSIWYG frontmatter presentation into a single inline YAML block, removed the internal frontmatter scrollbar, restored visible focus treatment, aligned YAML and body text columns, and tightened the frontmatter-to-body spacing so the first heading stays in the same writing rhythm.
