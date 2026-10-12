# System Share Memos

> This file is the durable requirements contract for receiving operating-system shares in the installed console PWA and turning them into confirmed Memos. Current implementation facts belong in `IMPLEMENTATION.md`; lifecycle and compatibility history belong in `HISTORY.md`.

## Context and Scope

- Context: The installed console PWA must receive content from an operating-system share sheet so an administrator can publish a URL as a clipping or any other payload as a flash Memo.
- In scope: the console Web Share Target manifest, the share-target service-worker handoff, browser-local pending-share storage, authentication and confirmation, URL classification, file attachments, Memo creation, visibility, and Chromium-first compatibility.
- Out of scope: registering the public static site as a write target, server-side unauthenticated pending-share storage, offline creation queues, background synchronization, OCR, file conversion, content extraction from non-URL files, and a cross-device pending-share inbox.

## Terms and Interfaces

- **System share**: An operating-system payload containing any combination of `title`, `text`, `url`, and `files`.
- **Share target**: The installed console PWA entry declared by the Web App Manifest `share_target` member.
- **Pending share**: One browser-local payload awaiting authentication or confirmation.
- **Share classification**: The final `clipping` or `memo` result calculated from the editable confirmation-page values.
- Interface: The console manifest, a share-target `POST` action, a minimal service worker, an IndexedDB pending-share store, and the existing Memo create path.

## Requirements

### REQ-SSM-001

- The console PWA MUST declare one Web Share Target for system shares and MUST be installable from `console.ivanli.cc`.
- The public static site MUST NOT receive or write system-share payloads.
- Inputs: an installed PWA and a system share event.
- Outputs: the console share-target action is offered by supported operating systems and browsers.

### REQ-SSM-002

- The share target MUST accept `title`, `text`, `url`, and files through `POST` with `multipart/form-data`.
- The service worker MUST intercept only the configured share-target action and MUST not become a general offline cache, background-sync, or push subsystem.
- Inputs: Web Share Target form fields and file parts.
- Outputs: one normalized pending-share payload delivered to the confirmation flow.

### REQ-SSM-003

- An unauthenticated share MUST be stored only in the current browser's IndexedDB and MUST never be uploaded as an unauthenticated server-side pending record.
- The browser store MUST contain one replaceable slot, expire entries after 15 minutes, and delete the payload after successful creation, cancellation, or expiry.
- Inputs: a share received before administrator authentication.
- Outputs: a local pending share that can be resumed after login in the same browser, or an explicit loss/expiry message when local storage is unavailable.

### REQ-SSM-004

- Only an authenticated administrator session MAY create a Memo from a system share.
- An unauthenticated or non-administrator user MUST be directed to console login before the pending share can reach confirmation.
- Inputs: pending share and current session.
- Outputs: an authenticated confirmation flow or a refusal without server-side content persistence.

### REQ-SSM-005

- Every system share MUST pass through the confirmation page before Memo creation.
- The page MUST display and allow editing of title, text/remarks, URL, files, visibility, and tags, and MUST show the current share classification.
- Visibility MUST default to private for every system share, even when the existing manual Memo composer defaults to public.
- Inputs: normalized pending share.
- Outputs: an administrator-confirmed Memo input or an explicit cancellation.

### REQ-SSM-006

- The final classification MUST be recalculated from the edited confirmation values at confirmation time.
- A valid HTTP(S) URL in the dedicated `url` field MUST classify as clipping. If that field is absent, a `text` value whose trimmed content is exactly one valid HTTP(S) URL MUST also classify as clipping.
- A URL embedded alongside other text, an invalid URL, or no URL MUST classify as an ordinary Memo unless the administrator edits the payload into a valid clipping input.
- Inputs: edited confirmation values.
- Outputs: `clipping` or `memo` classification.

### REQ-SSM-007

- For a clipping, the dedicated URL MUST become the clipping target, the shared `title` MUST be treated as an author-provided title when non-empty, and shared `text` MUST become clipping remarks after removing a duplicate target-only text value.
- The visible Memo body MUST not repeat the target URL; existing clipping processing MUST own source capture, summary, translation, and source-page presentation.
- Share-origin clipping metadata MUST preserve clipping identity without automatically adding a visible `#剪藏` tag.
- Inputs: confirmed URL share values.
- Outputs: a share-origin 剪藏闪念 using existing clipping content boundaries.

### REQ-SSM-008

- A system share without a valid URL MUST create an ordinary Memo.
- Text MUST become Memo content, title MUST become the Memo title, and files MUST become attachments. A file-only share MUST be allowed with an empty body.
- Inputs: confirmed non-URL share values.
- Outputs: one ordinary 闪念 with zero or more attachments.

### REQ-SSM-009

- When a valid URL and files occur in one share, the URL classification MUST take precedence and all confirmed files MUST remain attachments on that same clipping Memo.
- The system MUST NOT split one confirmed share into multiple Memos.
- Inputs: a mixed URL/text/file share.
- Outputs: one clipping Memo with its attachments.

### REQ-SSM-010

- The confirmation page MUST allow an administrator to remove or edit a URL, and adding a valid URL MUST switch an ordinary Memo to clipping while removing the URL MUST switch it back to ordinary Memo.
- Classification changes MUST not silently discard text, title, tags, or attachments.
- Inputs: confirmation-page edits.
- Outputs: final classification and preserved user data consistent with the edits.

### REQ-SSM-011

- Files MUST be preserved as attachments without OCR, transcoding, or content parsing.
- The system MUST accept arbitrary declared MIME types subject to a maximum of 20 MiB per file, 50 MiB total per share, and 10 files per share.
- A limit violation or failed attachment staging MUST prevent Memo creation and expose a retryable error.
- Inputs: confirmed file parts.
- Outputs: atomically staged attachments or a failed confirmation with no Memo.

### REQ-SSM-012

- Attachments MUST inherit the owning Memo's visibility.
- Private attachments MUST remain administrator-only and MUST NOT enter public snapshots, RSS, or public media exports. Public attachments MUST follow the existing public-media publication boundary.
- Inputs: Memo visibility and staged attachments.
- Outputs: visibility-consistent attachment access.

### REQ-SSM-013

- Memo creation MUST be atomic with attachment staging: the system MUST create no Memo when any confirmed attachment cannot be staged.
- A successful creation MUST clear the pending share and temporary files; cancellation, expiry, and unrecoverable failure MUST also clean temporary files.
- Inputs: confirmed Memo data and staged files.
- Outputs: one complete Memo or no Memo and a retryable failure state.

### REQ-SSM-014

- Every confirmation submission MUST create a new independent Memo; the system MUST NOT deduplicate by URL, file hash, title, or body.
- A browser refresh or redirect MUST NOT create a second Memo for the same confirmation submission.
- Inputs: a confirmed pending share.
- Outputs: at most one Memo for that submission.

### REQ-SSM-015

- URL clipping MUST reuse the existing clipping URL safety, redirect, response-size, HTML-content, and failed-processing boundaries.
- A failed fetch MUST leave the confirmed Memo saved with a retryable clipping-processing state; it MUST NOT silently convert the Memo to an ordinary Memo.
- Inputs: a confirmed HTTP(S) clipping target.
- Outputs: existing clipping processing state and recovery behavior.

### REQ-SSM-016

- The system MUST remain online-first. Network failure MUST leave the pending share in the confirmation flow for retry and MUST NOT create a background offline publishing queue.
- A pending share that exceeds its TTL MUST show an explicit expiry result and require a new system share.
- Inputs: network or service failure during confirmation.
- Outputs: retryable confirmation or explicit expiry.

### REQ-SSM-017

- The system MUST record `system-share` as internal source metadata for diagnostics and audit without automatically adding a visible share tag or changing search classification.
- Inputs: a confirmed system share.
- Outputs: internal source provenance and unchanged user-controlled tags.

### REQ-SSM-018

- A confirmed public Memo MUST appear immediately in the console's live Memo surface and MUST enter the public static timeline only through the existing publication flow.
- A private Memo MUST remain outside public snapshots, RSS, and public media exports.
- Inputs: confirmed visibility choice.
- Outputs: existing real-time Memo and publication-boundary behavior.

### REQ-SSM-019

- The first supported platform contract MUST cover Chromium-based Android and desktop browsers that implement Web Share Target and installed PWA shares.
- Safari/iOS and Firefox MAY expose the ordinary web confirmation route, but the product MUST NOT promise system-share registration there until separately verified.
- Inputs: browser and operating-system capability.
- Outputs: capability-appropriate installation and a manual fallback where available.

## Verification

### VER-SSM-001

- Method: manifest and service-worker contract tests.
- covers: `REQ-SSM-001`, `REQ-SSM-002`, `REQ-SSM-019`
- Pass condition: the console manifest contains one valid share target, the POST action accepts all declared fields, only the share action is intercepted, and supported/unsupported browser behavior is explicit.

### VER-SSM-002

- Method: browser storage and authentication integration tests.
- covers: `REQ-SSM-003`, `REQ-SSM-004`, `REQ-SSM-016`
- Pass condition: unauthenticated payloads stay in one IndexedDB slot, resume after same-browser administrator login, expire and clean up at 15 minutes, and never create a server-side pending record or offline queue.

### VER-SSM-003

- Method: classification table tests for URL, text, invalid URL, files, mixed payloads, and confirmation edits.
- covers: `REQ-SSM-005`, `REQ-SSM-006`, `REQ-SSM-007`, `REQ-SSM-008`, `REQ-SSM-009`, `REQ-SSM-010`
- Pass condition: final confirmation values deterministically produce one clipping or ordinary Memo with the specified title, remarks, body, URL, tags, and attachments.

### VER-SSM-004

- Method: attachment staging and failure-injection tests.
- covers: `REQ-SSM-011`, `REQ-SSM-012`, `REQ-SSM-013`
- Pass condition: MIME-agnostic files within limits are retained, limit/staging failures create no Memo, temporary files are cleaned, and attachment access follows Memo visibility.

### VER-SSM-005

- Method: duplicate-submission, clipping-service, and publication-boundary integration tests.
- covers: `REQ-SSM-014`, `REQ-SSM-015`, `REQ-SSM-017`, `REQ-SSM-018`
- Pass condition: one confirmation creates one independent Memo, failed clipping remains retryable, source metadata is internal, and live/public visibility follows existing publication semantics.

## Related ADRs

- [ADR 0020: Console PWA as the system-share write target](../../adr/0020-console-pwa-system-share-target.md)

## Visual Evidence

- None

## References

- `./IMPLEMENTATION.md`
- `./HISTORY.md`
- [Memo clipping workflow](../memo-clipping/SPEC.md)
- [Public PWA](../public-pwa/SPEC.md)
