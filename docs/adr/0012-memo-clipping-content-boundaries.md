---
status: accepted
---

# Keep Clipping Attached to a Memo With a Private Conversation

A Memo tagged `#剪藏` remains the entry point and identity for captured reading material, rather than becoming a separate blog post. The captured original, Chinese translation, and generated summary inherit the Memo's content visibility, while its persistent article conversation is private to its creator and administrators. This preserves the existing capture and publication workflow without treating publication of an article as permission to publish the author's discussion.

The author-authored content remains before the generated summary, separated by a horizontal rule when additional content exists. The target URL is presented to readers through an explicit source-page action instead of repeated body text. Captured source and processing versions remain distinct from author-authored text so retries and edits can preserve both.

## Considered Options

- **Import the captured source as a standalone post**: rejected because it splits identity, navigation, and visibility away from the Memo the author used to capture the link.
- **Use one publication boundary for content and conversation**: rejected because a public Memo must not automatically publish private discussion history.
- **Replace author-authored content with a generated summary**: rejected because clipping must preserve the author's remarks and append the Agent's result.

## Consequences

- Public content exports can include the published Memo summary and captured reading versions, but must exclude private conversation state, user messages, model credentials, and runtime logs.
- Conversation access requires its own authorization checks, including when its parent Memo is public.
- Memo editing and content synchronization must preserve the clipping relationship and distinguish author-authored content from generated output.
- Replacing the target URL creates a new conversation and reading version; earlier successful material may remain internally as an explicitly attributed fallback. User-facing version history, past-conversation browsing, and manual restoration are not part of the clipping feature.
- Runtime execution state is separate from canonical Memo content and retained reading artifacts, so recovery and runtime replacement cannot change content ownership or publication permissions.
- The static public site retains its existing publication-snapshot semantics; clipping does not turn it into an authenticated server application.

## Related Contracts

- [Memo clipping workflow](../specs/memo-clipping/SPEC.md)
- [Domain glossary](../../CONTEXT.md)
