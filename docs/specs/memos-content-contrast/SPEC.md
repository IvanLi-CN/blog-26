# Memos Markdown Theme Contrast

## Background

Memos Markdown content must remain readable across every supported light and dark theme. The original defect came from theme classification and element colors drifting between hard-coded `dark:` rules and DaisyUI semantic tokens.

## Requirements

- Theme classification has one configuration-backed source of truth.
- Paragraphs, lists, headings, links, code, quotes, and tables use semantic theme colors.
- Memo list and detail rendering preserve their existing information structure.
- Theme changes keep `data-theme` and the document `dark` class consistent.

## Acceptance Criteria

- Memo Markdown is readable in `light`, `dark`, `system`, and every selectable configured theme.
- Nested lists, long text, inline code, blocks, quotes, and tables retain sufficient contrast.
- The collapsed-card fade does not make visible content unreadable.
- Theme behavior is covered by repeatable automated checks.

## Risks

- Shared Markdown color changes can affect posts as well as memos.
- Syntax-highlight themes may need separate contrast treatment.

## References

- `docs/daisyui-local-theme-scope.md`
