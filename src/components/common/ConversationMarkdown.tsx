"use client";

import type { Element } from "hast";
import { CornerUpLeft } from "lucide-react";
import type { JSX } from "react";
import { createContext, useContext, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ConversationMarkdownProps } from "./conversation/types";
import { ConversationCodeBlock } from "./markdown/components/ConversationCodeBlock";
import { ConversationImage } from "./markdown/components/ConversationImage";
import {
  conversationSanitizeSchema,
  conversationUrlTransform,
  isConversationExternalHref,
  rehypeNamespaceConversationFootnotes,
  remarkHtmlAsText,
  remarkPreventPartialLinkAutolink,
} from "./markdown/conversation-policy";
import { rehypeResponsiveTables } from "./markdown/plugins/rehype-responsive-tables";
import "katex/dist/katex.min.css";
import "@/styles/markdown-code.css";
import "./ConversationMarkdown.css";

const BlockCodeContext = createContext(false);

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textContent((value as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

function sourceFromCodeChildren(children: unknown): string {
  const value = textContent(children);
  // mdast-util-to-hast appends one structural newline to every block code node.
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function languageFromNode(node: Element | undefined): string | undefined {
  const className = node?.properties?.className;
  const classes = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? [className]
      : [];
  const languageClass = classes.find(
    (value) => typeof value === "string" && value.startsWith("language-")
  );
  return languageClass?.slice("language-".length) || undefined;
}

function linkProps(href: string | undefined) {
  return isConversationExternalHref(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ConversationCode({
  children,
  className: codeClassName,
  node,
  ...props
}: JSX.IntrinsicElements["code"] & { node?: Element }) {
  const isBlock = useContext(BlockCodeContext);
  if (isBlock) {
    return (
      <ConversationCodeBlock
        source={sourceFromCodeChildren(children)}
        language={languageFromNode(node)}
        className={codeClassName}
      />
    );
  }
  return (
    <code className={codeClassName ?? "conversation-inline-code"} {...props}>
      {children}
    </code>
  );
}

export function ConversationMarkdown({
  content,
  messageId,
  presentationId,
  resourceContext,
  className,
}: ConversationMarkdownProps) {
  const remarkPlugins = useMemo(
    () => [remarkHtmlAsText, remarkPreventPartialLinkAutolink, remarkMath, remarkGfm],
    []
  );
  const rehypePlugins = useMemo(
    () =>
      [
        [rehypeSanitize, conversationSanitizeSchema],
        [rehypeResponsiveTables, { wrapCells: true }],
        [rehypeKatex, { throwOnError: false, trust: false }],
        () => rehypeNamespaceConversationFootnotes(messageId, presentationId),
      ] as any,
    [messageId, presentationId]
  );
  const components = useMemo<Components>(
    () => ({
      pre({ children }) {
        return <BlockCodeContext.Provider value>{children}</BlockCodeContext.Provider>;
      },
      code: ConversationCode,
      a({ children, href, title, className: inheritedClassName, node, ...props }) {
        if (!href) return <span {...props}>{children}</span>;
        const isFootnoteBackref = node?.properties?.dataFootnoteBackref != null;
        if (isFootnoteBackref) {
          return (
            <a
              href={href}
              {...props}
              aria-label="返回正文"
              title="返回正文"
              className={classNames("conversation-footnote-backref", inheritedClassName)}
            >
              <CornerUpLeft size={16} aria-hidden="true" focusable="false" />
            </a>
          );
        }
        return (
          <a
            href={href}
            title={title}
            {...linkProps(href)}
            {...props}
            className={classNames("conversation-link", inheritedClassName)}
          >
            {children}
          </a>
        );
      },
      img({ src, alt, title, node: _node, ...props }) {
        return (
          <ConversationImage
            messageId={messageId}
            presentationId={presentationId}
            src={typeof src === "string" ? src : ""}
            alt={typeof alt === "string" ? alt : ""}
            title={typeof title === "string" ? title : undefined}
            resourceContext={resourceContext}
            {...props}
          />
        );
      },
      input({ type, checked, disabled, node: _node, ...props }) {
        return (
          <input type={type} checked={checked} disabled={disabled ?? true} readOnly {...props} />
        );
      },
    }),
    [messageId, presentationId, resourceContext]
  );

  return (
    <div className={["conversation-markdown", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={conversationUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
