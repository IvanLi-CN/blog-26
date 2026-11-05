import { useState } from "react";
import type { ConversationImageProps } from "../../conversation/types";
import { type ConversationImagePolicy, classifyConversationImage } from "../image-policy";
import "./ConversationImage.css";

type AvailableImage = Exclude<ConversationImagePolicy, { kind: "unavailable" }>;

function ImageState({
  policy,
  alt,
  title,
}: {
  policy: AvailableImage;
  alt: string;
  title?: string;
}) {
  const [state, setState] = useState<"waiting" | "loading" | "loaded" | "error">(
    policy.kind === "authorized" ? "loading" : "waiting"
  );
  const [attempt, setAttempt] = useState(0);
  const label = alt || "未提供图片说明";

  return (
    <span className="conversation-image__content" data-image-state={state}>
      {state === "loading" || state === "loaded" ? (
        // biome-ignore lint/performance/noImgElement: Astro React image with explicit consent; no Next.js image optimizer or proxy.
        <img
          key={attempt}
          src={policy.src}
          alt={alt}
          title={title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      ) : null}
      <span className="conversation-image__description">{label}</span>
      <span className="conversation-image__status" role="status">
        {state === "waiting" ? "外部图片尚未加载" : null}
        {state === "loading" ? "图片加载中" : null}
        {state === "loaded" ? "图片已加载" : null}
        {state === "error" ? "图片加载失败，可重试或继续阅读" : null}
      </span>
      {policy.kind === "external" ? (
        <span className="conversation-image__domain">{policy.domain}</span>
      ) : null}
      <span className="conversation-image__actions">
        {state === "waiting" || state === "error" ? (
          <button
            type="button"
            onClick={() => {
              setAttempt((value) => value + 1);
              setState("loading");
            }}
          >
            {state === "error" ? "重试加载图片" : "加载图片"}
          </button>
        ) : null}
        {policy.kind === "external" ? (
          <a
            href={policy.src}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            打开图片链接
          </a>
        ) : null}
      </span>
    </span>
  );
}

export function ConversationImage({
  src,
  alt,
  title,
  messageId,
  presentationId,
  resourceContext,
  className,
}: ConversationImageProps) {
  const policy = classifyConversationImage(src, resourceContext);
  // Remount synchronously on every consent identity or resolved target change. An effect-based
  // reset would briefly commit the next URL with the previous image's permission.
  const identity = JSON.stringify([
    presentationId,
    messageId,
    src,
    policy.kind,
    policy.kind === "unavailable" ? policy.reason : policy.src,
  ]);

  return (
    <span className={["conversation-image", className].filter(Boolean).join(" ")}>
      {policy.kind === "unavailable" ? (
        <span className="conversation-image__content" data-image-state="unavailable">
          <span className="conversation-image__description">{alt || "未提供图片说明"}</span>
          <span className="conversation-image__status" role="status">
            图片不可用：
            {policy.reason === "unsafe-url" ? "不安全的图片地址" : "缺少已授权资源上下文"}
          </span>
        </span>
      ) : (
        <ImageState key={identity} policy={policy} alt={alt} title={title} />
      )}
    </span>
  );
}
