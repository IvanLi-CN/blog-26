/// <reference types="astro/client" />

declare module "@clipping-reader" {
  export const ClippingDetail: typeof import("@/components/memos/ClippingDetail").ClippingDetail;
}

declare module "@console-memo-authoring" {
  export const PublicMemoComposerIsland: typeof import("./components/PublicMemoAuthoring").PublicMemoComposerIsland;
  export const PublicMemoDetailControlsIsland: typeof import("./components/PublicMemoAuthoring").PublicMemoDetailControlsIsland;
}
