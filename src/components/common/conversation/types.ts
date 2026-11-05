import type { ComponentType } from "react";

/** A stable local identity is allowed until a legacy subscription supplies its real ID. */
export interface ConversationMessageIdentity {
  readonly messageId: string;
  /** Distinguishes simultaneous mounts of the same conversation (page/panel/drawer). */
  readonly presentationId: string;
}

/** Internal system/tool messages must be filtered by the existing visibility policy. */
export type ConversationMessageRole = "user" | "assistant";

/** Frontend adaptation of existing statuses, not a new transport or persistence field. */
export type ConversationMessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface ConversationMessage extends ConversationMessageIdentity {
  readonly role: ConversationMessageRole;
  /** The entire unmodified server snapshot; never repaired HTML or an incremental delta. */
  readonly content: string;
  readonly status: ConversationMessageStatus;
}

/** A trusted caller resolves this URL through an existing authorized resource boundary. */
export interface ConversationAuthorizedImage {
  /** Final facade/access-controlled URL; still subject to image URL protocol validation. */
  readonly src: string;
}

/**
 * Supplied by application code, never parsed from model text or inferred from the first citation.
 * Missing/null resolution means no authorization, even for a same-origin URL.
 */
export interface ConversationImageResourceContext {
  /**
   * Resolve an exact source URL synchronously without fetch, preload or permission expansion.
   * Relative URLs may resolve only when this context binds their real authorized content root.
   * The callback must use existing resource/facade rules; it is not an allow-all URL mapper.
   */
  readonly resolveAuthorizedImage: (src: string) => ConversationAuthorizedImage | null;
}

export interface ConversationMarkdownProps extends ConversationMessageIdentity {
  readonly content: string;
  readonly resourceContext?: ConversationImageResourceContext;
  readonly className?: string;
}

/** Inject as a React component, allowing streaming to build before the renderer is integrated. */
export type ConversationMarkdownRenderer = ComponentType<ConversationMarkdownProps>;

export interface AssistantMessageContentProps extends ConversationMessage {
  /** Render through React (e.g. a local capitalized binding), never call a hook component directly. */
  readonly renderMarkdown: ConversationMarkdownRenderer;
  readonly resourceContext?: ConversationImageResourceContext;
  readonly className?: string;
}

export interface ConversationCodeSource {
  /** Exact Markdown code AST value, without the structural newline added by Markdown-to-HAST. */
  readonly source: string;
  /** Entire language token, including '+'/'-'; absence does not imply inline code. */
  readonly language?: string;
}

export interface ConversationCodeBlockProps extends ConversationCodeSource {
  readonly className?: string;
}

export interface ConversationImageProps extends ConversationMessageIdentity {
  /** Exact source URL: do not strip query/hash or widen consent to an origin/domain. */
  readonly src: string;
  readonly alt: string;
  readonly title?: string;
  readonly resourceContext?: ConversationImageResourceContext;
  readonly className?: string;
}

/** Local consent key only; never persisted as a global/domain allowlist. */
export interface ConversationImageConsentIdentity extends ConversationMessageIdentity {
  readonly src: string;
}
