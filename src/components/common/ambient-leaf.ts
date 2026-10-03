export type AmbientLeafVariant = "broad" | "willow";
export type AmbientLeafDetail = "full" | "conservative";

export const AMBIENT_LEAF_FRAME = { x: -64, y: -42, width: 128, height: 84 };
export const AMBIENT_LEAF_MAX_SIZE = 40;
export const AMBIENT_LEAF_SCALE = 90;
export const AMBIENT_CURRENT_ALPHA = 0.035;
export const AMBIENT_LEAF_STYLE = {
  fillAlpha: 0.035,
  strokeAlpha: 0.14,
  veinAlpha: 0.07,
  bladeWidth: 1.5,
  ribWidth: 1.6,
  veinWidth: 1,
};

export const AMBIENT_LEAF_PATHS = {
  broad: {
    blade:
      "M -32 7 C -29 -12 -14 -25 7 -24 C 21 -24 31 -15 43 -9 C 29 -7 28 15 6 22 C -13 27 -27 22 -32 7 Z",
    rib: "M -44 15 Q -37 10 -32 7 C -14 2 9 -4 43 -9",
    veins:
      "M -20 4 Q -21 -7 -16 -17 M -6 0 Q -6 -11 1 -20 M 9 -4 Q 13 -12 22 -17 M -20 4 Q -20 15 -9 22 M -6 0 Q -5 14 10 20 M 9 -4 Q 16 5 22 11",
  },
  willow: {
    blade: "M -37 5 C -16 -16 13 -20 44 -10 C 25 -2 -6 23 -37 5 Z",
    rib: "M -47 12 Q -40 7 -37 5 C -12 0 16 -7 44 -10",
    veins:
      "M -23 2 Q -20 -5 -10 -10 M -6 -2 Q 0 -10 12 -12 M -23 2 Q -16 11 -9 12 M -6 -2 Q 2 6 13 2",
  },
} satisfies Record<AmbientLeafVariant, { blade: string; rib: string; veins: string }>;

export function createAmbientLeafPaths(
  variant: AmbientLeafVariant,
  color: string,
  detail: AmbientLeafDetail = "full"
) {
  const paths = AMBIENT_LEAF_PATHS[variant];
  const style = AMBIENT_LEAF_STYLE;
  return (["blade", "rib", ...(detail === "full" ? ["veins"] : [])] as const).map((part) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const blade = part === "blade";
    path.setAttribute("d", paths[part as keyof typeof paths]);
    path.setAttribute("data-leaf-part", part);
    path.setAttribute("fill", blade ? color : "none");
    path.setAttribute("fill-opacity", String(blade ? style.fillAlpha : 0));
    path.setAttribute("stroke", color);
    path.setAttribute(
      "stroke-opacity",
      String(part === "veins" ? style.veinAlpha : style.strokeAlpha)
    );
    path.setAttribute(
      "stroke-width",
      String(blade ? style.bladeWidth : part === "rib" ? style.ribWidth : style.veinWidth)
    );
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    return path;
  });
}

export function getAmbientLeafAtlasSize(scale: number) {
  const density = (AMBIENT_LEAF_MAX_SIZE / AMBIENT_LEAF_SCALE) * scale * 2;
  const tileWidth = Math.ceil(AMBIENT_LEAF_FRAME.width * density);
  const tileHeight = Math.ceil(AMBIENT_LEAF_FRAME.height * density);
  const padding = 2;
  return {
    tileWidth,
    tileHeight,
    padding,
    width: (tileWidth + padding * 2) * 2,
    height: (tileHeight + padding * 2) * 2,
  };
}

export type AmbientLeafAtlas = {
  source: ImageBitmap;
  size: ReturnType<typeof getAmbientLeafAtlasSize>;
  close(): void;
};

export async function createAmbientLeafAtlas(scale: number): Promise<AmbientLeafAtlas> {
  const size = getAmbientLeafAtlasSize(scale);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Leaf atlas canvas unavailable");
  for (const [row, detail] of (["full", "conservative"] as const).entries()) {
    for (const [column, variant] of (["broad", "willow"] as const).entries()) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "-64 -42 128 84");
      svg.setAttribute("width", String(size.tileWidth));
      svg.setAttribute("height", String(size.tileHeight));
      svg.setAttribute("preserveAspectRatio", "none");
      svg.append(...createAmbientLeafPaths(variant, "white", detail));
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        context.drawImage(
          image,
          column * (size.tileWidth + size.padding * 2) + size.padding,
          row * (size.tileHeight + size.padding * 2) + size.padding
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  const source = await createImageBitmap(canvas);
  return { source, size, close: () => source.close() };
}
