---
status: accepted
---

# Console PWA as the System-Share Write Target

System shares will be registered by the installed `console.ivanli.cc` PWA, not the public static site, because accepting a share requires administrator authentication, Memo writes, attachment staging, and the live publication boundary. The share target will use a minimal Service Worker to hand off `multipart/form-data` to a confirmation page; before authentication, the payload stays only in one short-lived IndexedDB slot in the current browser. This keeps private files out of unauthenticated server storage and preserves the public site's read-only, online-first contract while allowing a URL share to become a clipping and every other confirmed payload to become a Memo.

## Considered Options

- **Register `ivanli.cc` as the target**: rejected because the public static deployment has no administrator write boundary and would require expanding its runtime and authentication responsibilities.
- **Store unauthenticated shares on the server**: rejected because it would upload private text and files before the user authenticates and would require retention, cleanup, and cross-session authorization rules.
- **Reject every unauthenticated share**: rejected because it forces users to return to the source app and repeat a share after login.

## Consequences

- The console manifest and PWA install path become part of the system-share product contract.
- Browser-local storage loss, quota failure, or expiry can discard an unauthenticated share and must be communicated clearly.
- The Service Worker adds a focused control path but does not promise general offline publishing or background synchronization.
