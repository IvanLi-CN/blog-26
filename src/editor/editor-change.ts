export type EditorChangeSource = "programmatic" | "user";

export type EditorChangeMeta = {
  source: EditorChangeSource;
};

export const PROGRAMMATIC_EDITOR_CHANGE: EditorChangeMeta = { source: "programmatic" };
export const USER_EDITOR_CHANGE: EditorChangeMeta = { source: "user" };
