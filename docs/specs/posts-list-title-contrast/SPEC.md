# Posts List Title Contrast

## Background

Post titles on `/posts` became too light under themes such as `nord`, weakening readability and hierarchy relative to excerpts.

## Requirements

- Post title links use semantic theme colors rather than default heading/link colors.
- Default, hover, active, and visited states remain readable in every configured theme.
- The change does not alter list layout, data, permissions, or unrelated links.

## Acceptance Criteria

- Titles remain more prominent than excerpts in `light`, `dark`, `system`, and `nord`.
- Visited state does not reduce contrast.
- Hover state communicates interactivity without sacrificing readability.
- Automated coverage blocks regression to the theme-provided low-contrast link color.

## Risks

- Explicit semantic colors must preserve a visible interactive hover state.
