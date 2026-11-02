# ADR 0039: Server-Driven Assistant Feature Configuration

## Context

The public static site and the Console are built as separate frontend artifacts, but they expose the same assistant launcher and call the same assistant service. A build-time flag is useful for choosing an optimistic fallback when the public configuration request fails, but it cannot represent an operator changing the feature after the artifacts have been published.

`CONSOLE_RUNTIME` identifies the Console runtime shape. It controls concerns such as the no-index policy and Console-only service-worker behavior; it is not a product feature flag and must not decide whether the assistant launcher is rendered.

The public client also should not receive an unnecessarily rich runtime payload. Returning server version metadata, a defaults hash, or the internal service switch would expose implementation details without helping the client decide whether to render the launcher.

## Decision

Persist assistant feature settings in the dedicated `site_feature_settings` record. The record has two independent assistant controls:

- `service.enabled`: server-enforced availability of assistant capabilities.
- `launcher.enabled`: desired visibility of the public launcher.

The effective public launcher value is `service.enabled && launcher.enabled`. The service switch is never included in the public response. The admin API exposes both controls through `/api/admin/site-features` with an optimistic revision check, and the admin UI provides the editing surface.

The build input `PUBLIC_ASSISTANT_LAUNCHER_DEFAULT` is captured with the frozen release inputs and passed to both frontend builds, backend compilation, and the final container runtime. Its only client-facing role is the fallback default. The server also uses the same value as the default for a missing database record, so a fresh deployment does not unexpectedly diverge from its released artifacts.

The public API exposes `GET /api/public/runtime-config?siteVersion=...`. The request version is an opaque identity shared by the static artifact and Console image for the same product source. It is used only to choose the response shape:

- Matching version: return `mode: "diff"` and only the nested fields whose effective value differs from the build default.
- Mismatching or absent version: return `mode: "full"` and the complete set of public feature fields.

The public response is intentionally limited to this shape:

```json
{
  "schemaVersion": 1,
  "mode": "diff",
  "features": {
    "assistant": {
      "launcher": {}
    }
  }
}
```

When the effective launcher is disabled for a matching client, the only override is nested under the same structure:

```json
{
  "schemaVersion": 1,
  "mode": "diff",
  "features": {
    "assistant": {
      "launcher": { "enabled": false }
    }
  }
}
```

For a mismatching client, the response is full but still excludes internal controls:

```json
{
  "schemaVersion": 1,
  "mode": "full",
  "features": {
    "assistant": {
      "launcher": { "enabled": false }
    }
  }
}
```

The endpoint emits `ETag` and short public cache headers. The client reads it once during initialization, merges a diff over its build default once, and does not poll or perform a second reconciliation. A failed read falls back to the build default. This fallback does not weaken server enforcement: assistant and clipping assistant API routes check `service.enabled` on the server and return `404 FEATURE_DISABLED` when disabled. Disabling only the launcher leaves direct `/chat` access available.

## Consequences

The backend remains the authority for feature availability while static artifacts remain resilient to a temporary configuration read failure. Matching artifacts receive minimal public data; stale or incompatible artifacts receive enough public data to make a correct decision without requiring a server version field in the body.

The configuration endpoint is intentionally not a general runtime manifest. New public feature fields require a schema version change or an explicitly reviewed schema extension. Internal service controls remain in the authenticated admin API and server-side enforcement path.
