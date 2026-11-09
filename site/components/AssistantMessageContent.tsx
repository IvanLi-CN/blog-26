import { Component, type CSSProperties, memo, type ReactNode } from "react";
import type { AssistantMessageContentProps } from "../../src/components/common/conversation/types";
import { getAssistantRenderState } from "../lib/assistant-render-state";

const literalStyle: CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

function LiteralBody({ content }: { content: string }) {
  return (
    <div data-message-body style={literalStyle}>
      {content}
    </div>
  );
}

interface BoundaryProps extends AssistantMessageContentProps {
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
  input: BoundaryProps;
}

class MessageRenderBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, input: this.props };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    next: BoundaryProps,
    state: BoundaryState
  ): Partial<BoundaryState> | null {
    const previous = state.input;
    if (
      next.content !== previous.content ||
      next.messageId !== previous.messageId ||
      next.presentationId !== previous.presentationId ||
      next.status !== previous.status ||
      next.renderMarkdown !== previous.renderMarkdown ||
      next.resourceContext !== previous.resourceContext
    ) {
      return { failed: false, input: next };
    }
    return null;
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <LiteralBody content={this.props.content} />
        <p role="status" className="text-xs text-[color:var(--nature-text-soft)]">
          内容显示失败，已显示原文。
        </p>
      </>
    );
  }
}

/** Sources and generation actions stay with the caller, outside the body boundary. */
export const AssistantMessageContent = memo(function AssistantMessageContent(
  props: AssistantMessageContentProps
) {
  const {
    messageId,
    presentationId,
    role,
    status,
    className,
    renderMarkdown: Markdown,
    resourceContext,
  } = props;
  const state = getAssistantRenderState(props);
  return (
    <div
      data-presentation-id={presentationId}
      data-message-id={messageId}
      data-message-role={role}
      data-message-status={status}
      aria-busy={state.isGenerating}
      className={className}
      style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}
    >
      {state.mode === "literal" ? (
        <LiteralBody content={state.content} />
      ) : (
        <MessageRenderBoundary {...props}>
          <div
            data-message-body
            className={
              status === "streaming" || status === "completed"
                ? "assistant-message-body-reveal"
                : undefined
            }
          >
            <Markdown
              content={state.content}
              messageId={messageId}
              presentationId={presentationId}
              resourceContext={resourceContext}
            />
          </div>
        </MessageRenderBoundary>
      )}
    </div>
  );
});
