# Build-Time Web Demo and Story Boundary

## Status

Accepted

## Context

The repository previously used page-level Storybook entries as visual evidence for public pages, the admin preview, and an admin shell state. Storybook is a useful component and interaction gallery, but those entries mounted route-level compositions and encouraged future agents to treat a Story as the cheapest substitute for a browser-verifiable product surface.

The repository already has real Astro public routes and a Vite admin application. Their page evidence needs deterministic data and safe mock behavior without allowing a live artifact to switch into Demo mode through a URL or browser storage. The project also rejects a parallel demo route: the Demo must remain on the official product paths.

## Decision

1. Page-level visual evidence is produced by a separate build-time Web Demo artifact. The public Web Demo artifact is a Node-backed SSR runtime with hydrated CSR islands and client navigation; it is not an SSG snapshot.
2. The Web Demo reuses the shipped Astro and Vite application trees and official paths such as `/memos/`, `/playbook/*`, and `/admin/*`. It does not add a copied page or an independent Demo path.
3. `WEB_DEMO_BUILD`/`PUBLIC_WEB_DEMO_BUILD` select the Astro Demo build and `VITE_WEB_DEMO_BUILD` selects the Admin Demo build. The selection is baked into the artifact before the application bootstraps.
4. The Admin Demo installs its in-memory API interception before rendering the router. The public Demo is built from generated local fixtures, a public snapshot, and a deterministic Playbook bundle. Demo mutations stay in memory.
5. Storybook contains reusable components, fragments, and focused states only. The deleted route/page Stories must not be reintroduced. Search remains a component-state Story and no longer declares a page evidence surface.
6. A repository test checks the Story boundary and the absence of runtime Demo toggles. The package exposes `web-demo:site`, `web-demo:admin`, `web-demo:build`, and `web-demo:start` entry points.
7. Every Web Demo artifact includes the shared Inspector on the official route. It controls scene, persona, network condition, data mode, simulated actions, shareable `d_*` state, and recent in-memory mutations without granting permissions or calling a real write API.
8. `WEB_DEMO_BUILD` selects the SSR Demo target at build time. The public server renders each official route from controlled fixture/snapshot data, while browser-side islands and the Inspector exercise CSR requests, delays, offline failures, identity responses, and client route transitions. The live public target remains static and cannot be switched into Demo mode.

## Consequences

- Page evidence is closer to the deployed product surface and exercises routing, boot order, deterministic data, and responsive layout together.
- The Web Demo can test the boundary that SSG cannot provide: a real document request, server route resolution, hydration, client navigation, and client-owned request behavior in one official-route surface.
- Live and Demo builds require separate output directories and must be validated independently.
- The Demo public output contains a standalone `server/entry.mjs` plus browser assets; `web-demo:start` runs that server with the generated deterministic data paths.
- A browser opening a live artifact with a Demo-looking query does not receive mocks; a Demo artifact remains a Demo because of its build identity.
- Component interaction coverage remains fast and local in Storybook, while route-level assertions move to browser checks against the Web Demo artifact.
- Browser evidence can reproduce a route state from a URL and exercise failure, loading, empty, permission, and mutation feedback from one control surface.
- Historical screenshots may remain in Specs, but their source must be described as historical rather than current Storybook coverage.

## Alternatives Considered

- Runtime query/localStorage switch: rejected because a live artifact could silently cross the authentication and API boundary.
- Independent Demo route: rejected because copied route trees drift from the product surface and violate the project's official-route evidence contract.
- Keeping page Stories as fallback: rejected because stable official routes and a deterministic Web Demo now exist.
