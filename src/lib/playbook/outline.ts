import { getMarkdownOutline } from "../markdown-outline";
import type { PlaybookDocSection } from "./types";

export type PlaybookContentsItem = {
  id: string;
  title: string;
  children?: PlaybookContentsItem[];
};

export function createPlaybookContents(sections: PlaybookDocSection[]): PlaybookContentsItem[] {
  return sections.map((section) => {
    const root: PlaybookContentsItem = { id: section.id, title: section.title, children: [] };
    const stack = [{ depth: 0, item: root }];
    for (const heading of getMarkdownOutline(section.markdown, section.id)) {
      while (stack.length > 1 && stack[stack.length - 1].depth >= heading.depth) stack.pop();
      const item: PlaybookContentsItem = { id: heading.id, title: heading.title, children: [] };
      stack[stack.length - 1].item.children?.push(item);
      stack.push({ depth: heading.depth, item });
    }
    return root;
  });
}
