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
- **Submission identity**: A browser-generated temporary UUID stored with one pending share and reused for edits, refreshes, retries, and response-loss recovery.
- **Publish detail page**: The console `/memos/:slug` route for the Memo returned by a successful system-share submission.
- **Global Toast**: The console-wide notification surface for publish progress, success, and retryable failure actions.
- Interface: The console manifest, a share-target `POST` action, a minimal service worker, an IndexedDB pending-share store, the global Toast surface, and the existing Memo create path.

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
- The page MUST expose the original share payload in an expandable read-only panel and provide exactly one editable Memo content field populated with the parsed content. For a clipping, that content MUST begin with the target URL, preserve any share remarks, and include one system-generated `#剪藏` parser marker in the same field; the share title and user tags remain submission metadata rather than separate Memo input fields, files MAY be added or removed as attachments, and visibility remains a publish control.
- Visibility MUST default to private for every system share, even when the existing manual Memo composer defaults to public.
- Inputs: normalized pending share.
- Outputs: an administrator-confirmed Memo input or an explicit cancellation.

### REQ-SSM-006

- The final classification MUST be recalculated from the edited confirmation values at confirmation time.
- A valid HTTP(S) URL in the dedicated `url` field MUST classify as clipping. If that field is absent, a `text` value whose trimmed content is exactly one valid HTTP(S) URL, or whose first non-empty line is a valid plain URL, Markdown link, or autolink, MUST classify as clipping.
- A URL embedded in unrelated text, an invalid URL, or no URL MUST classify as an ordinary Memo. The editable Memo field MAY use a plain URL, Markdown link, or autolink as its first non-empty line to represent a clipping.
- Inputs: edited confirmation values.
- Outputs: `clipping` or `memo` classification.

### REQ-SSM-007

- For a clipping, the dedicated URL MUST become the clipping target, the shared `title` MUST be treated as an author-provided title when non-empty, and shared `text` MUST become clipping remarks after removing a duplicate target-only text value.
- The visible Memo body MUST preserve the target URL as its first line so the authored content remains self-identifying; existing clipping processing MUST continue to own source capture, summary, translation, and source-page presentation.
- Share-origin clipping content MUST preserve clipping identity with one system-generated `#剪藏` parser marker in the Memo body. The marker MUST NOT be added to the user-controlled frontmatter tag list or exposed as a separate tag input.
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

- Editing the single Memo content field MUST preserve the accepted share metadata and attachments while the server recalculates the final classification from the stored URL and edited content.
- The confirmation page MUST NOT render separate title, URL, or tag editors for the Memo.
- Inputs: confirmation-page content edits and attachment/visibility controls.
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

- Every new Submission Identity MUST create at most one independent Memo; distinct system shares MUST remain independent even when their URL, file hash, title, or body match.
- Concurrent requests, browser refresh, retry, lost responses, server restarts, and a failure between Memo creation and submission completion MUST NOT create a second Memo for the same Submission Identity.
- Memo creation and completion of the Submission Identity MUST be atomic or recoverable so a retry can find the original Memo after any uncertain outcome.
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

- The system MUST record `system-share` as internal source metadata for diagnostics and audit without automatically adding a separate share tag or changing search classification. The system-generated `#剪藏` parser marker remains part of the Memo body so existing clipping recognition works without internal metadata.
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

### REQ-SSM-020

- The confirmation page MUST show publishing progress through the console-wide Global Toast immediately after submission begins.
- The progress Toast MUST remain visible until the server request resolves and MUST not be represented only by disabled button text or an inline form message.
- Inputs: an administrator submitting confirmed share values.
- Outputs: a visible `正在发布` publish-state Toast while the request is active.

### REQ-SSM-021

- A successful submission MUST show a success Publish State Toast on the confirmation page before navigating to the Publish Detail Page.
- The success Toast MUST remain visible for approximately 800-1200 ms before navigation so the administrator can perceive the confirmation.
- The client MUST navigate to `/memos/:slug` using the returned Memo slug after the success Toast has been shown; it MUST NOT navigate only to the Memo list.
- Inputs: a successful system-share response containing Memo detail identity.
- Outputs: a success Toast followed by the created Memo's detail page.

### REQ-SSM-022

- A failed submission MUST keep the administrator on the confirmation page and show a failure Publish State Toast with an explicit `重试` action.
- Activating `重试` MUST reuse the current edited values and the same Submission Identity, update the existing Toast to `正在发布`, and MUST NOT stack a second failure Toast for the same attempt.
- Inputs: a retryable publish or attachment failure.
- Outputs: an actionable failure Toast and an idempotent retry path.

### REQ-SSM-023

- The browser MUST generate the Submission Identity when the system share is first accepted and store it with the IndexedDB pending slot.
- The identity MUST survive authentication, edits, page refresh, retry, and a lost HTTP response; a newly received system share MUST create a new identity and replace the single pending slot.
- Inputs: a system share lifecycle in one browser.
- Outputs: one stable client-owned identity per pending share.

### REQ-SSM-024

- A successful system-share response MUST include the Memo detail identity required for navigation, including its `slug` and enough detail metadata for the success state.
- A replay using a completed Submission Identity MUST return the original Memo detail identity rather than creating a second Memo or returning an opaque duplicate-only result.
- Inputs: first submission or idempotent replay.
- Outputs: one navigable Memo detail target for both first success and response-loss recovery.

### REQ-SSM-025

- The confirmation page MUST render the submit action as the filled primary button defined by the Nature UI system, with visible hover, focus, disabled, and publishing states.
- The official `/share` route MUST provide owner-reviewable visual evidence at mobile and desktop sizes for the populated confirmation state, publishing Toast, success Toast, retryable failure Toast, and the resulting detail navigation.
- The evidence MUST come from the implementation candidate and MUST be presented to the owner for review before production release; production release MUST wait until the owner confirms the visual result.
- Inputs: the shipped console confirmation flow.
- Outputs: accessible, visually reviewable publish controls and state feedback without a separate page-level Demo route.

### REQ-SSM-026

- The mobile confirmation page MUST use compact non-editor spacing so unnecessary outer padding, oversized structural headers, and gaps between form sections do not push the publish controls beyond the first viewport when the content can otherwise fit.
- With short Memo content, no attachments, the original-share panel collapsed, and the software keyboard closed, the publish controls MUST be fully visible near the bottom of the first usable viewport at `360x740` and `393x852` CSS px. The Memo editor MUST adapt to the remaining usable height rather than leaving surplus space in structural gaps.
- Compactness MUST preserve readable text, required information, and the shared Nature UI touch-target minimum of `44px`. The page MUST respect browser chrome and device safe areas when determining usable height and positioning the bottom controls.
- Inputs: the mobile viewport and a populated confirmation form.
- Outputs: a compact first-screen confirmation layout whose flexible editor uses the remaining height.

### REQ-SSM-027

- Below `640px`, the confirmation page's primary form surface MUST reach both viewport edges, without an additional outer gutter or nested container padding that narrows the whole form.
- Text and controls MUST retain the internal insets defined by the shared Nature UI responsive contract, including `16px` at `393px` viewport width and `12px` below `375px`; reaching the viewport edges MUST NOT place text or touch controls flush against them.
- The layout MUST avoid horizontal page overflow and preserve the existing usable tablet and desktop composition.
- Inputs: the confirmation page at mobile, tablet, and desktop widths.
- Outputs: a full-width mobile form carrier with consistent internal spacing and usable wider layouts.

### REQ-SSM-028

- When long content, more attachments, expanded original-share data, a short viewport, or the software keyboard leaves insufficient usable height, the confirmation page MUST grow naturally and allow continuous vertical page scrolling to the publish controls.
- The editor MUST retain a usable minimum height. Required content and controls MUST remain readable and reachable without clipping, overlap, or forced compression to fit one screen.
- The publish controls MUST remain in normal document flow after the form content. The first-screen bottom placement requirement applies when the content fits; it MUST NOT prevent scrolling when the content exceeds the usable height.
- Inputs: confirmation content and available height, including changes caused by keyboard or viewport resizing.
- Outputs: a scrollable confirmation flow with a usable editor and reachable publish controls.

### REQ-SSM-029

- A vertical finger swipe beginning in the attachment region MUST scroll the confirmation page whenever the page has remaining scroll range. This MUST work over the attachment heading, empty state, file rows, and attachment-control area.
- The attachment region MUST NOT trap the gesture or block scrolling from reaching the page when the region has no scroll range of its own.
- Taps on attachment controls MUST continue to add or remove files, and normal editor focus, text selection, and input behavior MUST remain available.
- Inputs: touch gestures and taps within the populated confirmation page.
- Outputs: continuous page scrolling from the attachment region and working attachment controls.

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

### VER-SSM-006

- Method: browser interaction tests for publish state Toasts, retry actions, detail navigation, and completed-submission replay.
- covers: `REQ-SSM-020`, `REQ-SSM-021`, `REQ-SSM-022`, `REQ-SSM-023`, `REQ-SSM-024`
- Pass condition: progress and success are global Toasts, failures expose an in-Toast retry that reuses the same identity and edited values, first success and replay both navigate to one Memo detail page, and no duplicate Memo is created.

### VER-SSM-007

- Method: owner-reviewed visual evidence from the official `/share` route at mobile and desktop viewports.
- covers: `REQ-SSM-025`
- Pass condition: the filled primary button has sufficient contrast and stable dimensions, Toasts remain readable and actionable over the page, the populated form is scannable at both sizes, and the detail navigation result is captured.

### VER-SSM-008

- Method: layout measurements and owner-reviewed official-route Web Demo evidence at `360x740` and `393x852` CSS px, using a valid pending share with a short URL and `#剪藏` content, no attachments, collapsed original-share data, and a closed software keyboard.
- covers: `REQ-SSM-026`, `REQ-SSM-028`
- Pass condition: the complete publish button, visibility control, and cancel action are visible near the first viewport's bottom without an initial scroll. Increasing available height expands the editor instead of creating surplus structural whitespace. Readable text and `44px` touch targets are preserved, and safe areas do not obscure the controls.

### VER-SSM-009

- Method: official-route responsive layout measurements at mobile widths `320px`, `360px`, `375px`, `393px`, and `639px`, with wider-layout regression checks at `768x1024` and `1440x1000` CSS px.
- covers: `REQ-SSM-027`
- Pass condition: below `640px`, the primary form carrier reaches both viewport edges, text and controls retain the shared internal insets, and there is no horizontal page overflow. Tablet and desktop controls remain readable, reachable, and free of overlap.

### VER-SSM-010

- Method: touch-input browser checks on the official `/share` route with long Memo content, multiple attachments, expanded original-share data, and a constrained `360x568` CSS-pixel viewport; additionally verify the software-keyboard transition in a supported mobile browser. Use a scrollable page and compare the same vertical swipe from the attachment heading, empty state, file row, and attachment-control area with a swipe elsewhere on the page.
- covers: `REQ-SSM-028`, `REQ-SSM-029`
- Pass condition: vertical swipes from every attachment-region starting area move the page while scroll range remains, and the publish controls can be reached. The editor retains a usable minimum height, keyboard open/close does not leave controls unreachable, and attachment taps plus editor input and text selection continue to work.

## Related ADRs

- [ADR 0003: Public mobile content stream](../../adr/0003-public-mobile-content-stream.md)
- [ADR 0020: Console PWA as the system-share write target](../../adr/0020-console-pwa-system-share-target.md)

## Visual Evidence

- Required after candidate implementation and before production release: owner-reviewable captures from the official `/share` route at 390x844 and 1440x1000, covering populated, publishing, success, retryable failure, and resulting detail states. The current candidate's visual evidence is owner-confirmed; real-device keyboard, safe-area, and gesture acceptance remains tracked as a separate empirical requirement.
- Mobile layout evidence MUST additionally cover the compact initial state at `360x740` and `393x852`, a content-overflow state, and attachment-origin touch scrolling as defined by `VER-SSM-008..010`. Earlier populated-state captures do not establish these layout and gesture pass conditions.
- The current compact initial-state captures are `assets/system-share-mobile-layout-360.png` and `assets/system-share-mobile-layout-393.png`; both are from the formal `/share` Web Demo and include the compact `返回首页` escape control.

## References

- `./IMPLEMENTATION.md`
- `./HISTORY.md`
- [Memo clipping workflow](../memo-clipping/SPEC.md)
- [Public PWA](../public-pwa/SPEC.md)
- [Nature UI responsive contract](../nature-front-ui/SPEC.md#44-responsive-control-and-code-density)
