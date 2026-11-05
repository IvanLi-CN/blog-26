"use client";

import type { Element } from "hast";
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
  rehypeConversationOverflow,
  rehypeNamespaceConversationFootnotes,
  remarkHtmlAsText,
  remarkPreventPartialLinkAutolink,
} from "./markdown/conversation-policy";
import { rehypeResponsiveTables } from "./markdown/plugins/rehype-responsive-tables";
import "katex/dist/katex.min.css";
import "@/styles/markdown-code.css";

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
        rehypeConversationOverflow,
        () => rehypeNamespaceConversationFootnotes(messageId, presentationId),
      ] as any,
    [messageId, presentationId]
  );
  const components = useMemo<Components>(
    () => ({
      h1({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h1
            className={classNames(
              "mt-5 mb-3 font-heading text-xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)] first:mt-0 md:text-2xl",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h1>
        );
      },
      h2({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h2
            className={classNames(
              "mt-5 mb-3 font-heading text-lg font-semibold tracking-[-0.02em] text-[color:var(--nature-text)] first:mt-0 md:text-xl",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h2>
        );
      },
      h3({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h3
            className={classNames(
              "mt-4 mb-2 font-heading text-base font-semibold text-[color:var(--nature-text)] first:mt-0 md:text-lg",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h3>
        );
      },
      h4({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h4
            className={classNames(
              "mt-4 mb-2 text-base font-semibold text-[color:var(--nature-text)] first:mt-0",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h4>
        );
      },
      h5({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h5
            className={classNames(
              "mt-3 mb-2 text-sm font-semibold text-[color:var(--nature-text)] first:mt-0",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h5>
        );
      },
      h6({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <h6
            className={classNames(
              "mt-3 mb-2 text-xs font-semibold text-[color:var(--nature-text-soft)] first:mt-0",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </h6>
        );
      },
      p({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <p
            className={classNames(
              "mb-3 leading-7 text-[color:var(--nature-text)]",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </p>
        );
      },
      ul({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <ul
            className={classNames(
              "my-4 list-outside list-disc space-y-1 pl-6 text-[color:var(--nature-text)]",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </ul>
        );
      },
      ol({ children, start, className: inheritedClassName, node: _node, ...props }) {
        return (
          <ol
            start={start}
            className={classNames(
              "my-4 list-outside list-decimal space-y-1 pl-6 text-[color:var(--nature-text)]",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </ol>
        );
      },
      li({ children, node: _node, ...props }) {
        return <li {...props}>{children}</li>;
      },
      blockquote({ children, className: inheritedClassName, node: _node, ...props }) {
        return (
          <blockquote
            className={classNames(
              "my-3 rounded-[var(--nature-radius-sm)] border border-[rgba(var(--nature-accent-rgb),0.22)] bg-[rgba(var(--nature-highlight-rgb),0.26)] px-3 py-2 italic text-[color:var(--nature-text-soft)] sm:px-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              inheritedClassName
            )}
            {...props}
          >
            {children}
          </blockquote>
        );
      },
      hr({ className: inheritedClassName, node: _node, ...props }) {
        return (
          <hr
            className={classNames("my-8 border-none nature-divider", inheritedClassName)}
            {...props}
          />
        );
      },
      pre({ children }) {
        return <BlockCodeContext.Provider value>{children}</BlockCodeContext.Provider>;
      },
      code: ConversationCode,
      a({ children, href, title, node: _node, ...props }) {
        if (!href) return <span {...props}>{children}</span>;
        return (
          <a href={href} title={title} {...linkProps(href)} {...props}>
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
    <div
      className={["conversation-markdown min-w-0 max-w-full break-words", className]
        .filter(Boolean)
        .join(" ")}
    >
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
