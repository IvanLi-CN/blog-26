import type { ConversationMessageIdentity } from "../../src/components/common/conversation/types";

/** Shared DOM contract for message boundaries; citations must be outside this body. */
export const assistantMarkdownAttributes = {
  messageId: "data-message-id",
  presentationId: "data-presentation-id",
  body: "data-message-body",
} as const;

function cssString(value: string): string {
  return `"${Array.from(value, (character) => `\\${character.codePointAt(0)?.toString(16)} `).join("")}"`;
}

/** Works with DOM querySelector and Playwright locator without interpolating unsafe IDs. */
export function messageBodySelector(identity: ConversationMessageIdentity): string {
  return `[data-presentation-id=${cssString(identity.presentationId)}][data-message-id=${cssString(identity.messageId)}] [data-message-body]`;
}

/** Fail on missing/ambiguous bodies instead of passing against a source list or another message. */
export function getMessageBody(
  root: ParentNode,
  identity: ConversationMessageIdentity
): HTMLElement {
  const matches = root.querySelectorAll<HTMLElement>(messageBodySelector(identity));
  const body = matches[0];
  if (matches.length !== 1 || !body) {
    throw new Error(
      `Expected one message body for ${identity.presentationId}/${identity.messageId}; found ${matches.length}`
    );
  }
  return body;
}

export interface FootnoteReference {
  referenceId: string;
  targetId: string;
  backlinkCount: number;
}

/** Check real DOM association edges, not fixture strings or a page-wide list count. */
export function inspectFootnoteReferences(body: HTMLElement): FootnoteReference[] {
  return Array.from(
    body.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]"),
    (reference) => {
      const href = reference.getAttribute("href") ?? "";
      const targetId = href.startsWith("#") ? decodeURIComponent(href.slice(1)) : "";
      const targets = Array.from(body.querySelectorAll<HTMLElement>("[id]")).filter(
        (node) => node.id === targetId
      );
      const target = targets[0];
      if (!reference.id || targets.length !== 1 || !target) {
        throw new Error(
          `Footnote reference ${reference.id || "(missing id)"} has no unique in-message target: ${href}`
        );
      }
      const backlinkCount = Array.from(target.querySelectorAll("a[data-footnote-backref]")).filter(
        (backlink) => backlink.getAttribute("href") === `#${reference.id}`
      ).length;
      if (!backlinkCount)
        throw new Error(`Footnote ${targetId} has no backlink to ${reference.id}`);
      for (const attribute of ["aria-describedby", "aria-labelledby"] as const) {
        for (const id of (reference.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)) {
          if (!Array.from(body.querySelectorAll("[id]")).some((node) => node.id === id)) {
            throw new Error(`Footnote ${reference.id} has an out-of-message ${attribute}: ${id}`);
          }
        }
      }
      return { referenceId: reference.id, targetId, backlinkCount };
    }
  );
}

export function duplicateIds(root: ParentNode): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const node of root.querySelectorAll<HTMLElement>("[id]")) {
    if (seen.has(node.id)) duplicates.add(node.id);
    seen.add(node.id);
  }
  return [...duplicates];
}
