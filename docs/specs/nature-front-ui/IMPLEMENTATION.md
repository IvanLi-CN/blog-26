# Implementation

- Lifecycle: active
- Implementation: implemented

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable fallback. The generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input. Project detail pages render available social previews at intrinsic height, and complete light/dark poster or social-preview pairs follow the resolved public theme.
