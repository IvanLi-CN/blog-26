# Implementation

- Lifecycle: active
- Implementation: implemented

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable placeholder only when no poster asset exists. Real poster artwork is never covered by generated copy or a scrim. The poster generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input.

Social previews use a separate Sharp pipeline with 640w and 1280w AVIF/WebP candidates, intrinsic dimensions, inline previews, and production budget checks. Raw social PNG sources remain private to the build input, while the rendered 2:1 frame keeps the inline preview visible during lazy loading or delivery failure. Complete light/dark poster or social-preview pairs follow the resolved public theme.
