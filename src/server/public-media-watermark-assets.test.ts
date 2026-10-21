import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const watermarkFiles = [
  "public/watermark-ivanli-a.v1.svg",
  "public/watermark-ivanli-b.v1.svg",
  "public/watermark-ivanli-a.light.v3.svg",
  "public/watermark-ivanli-a.dark.v3.svg",
  "public/watermark-ivanli-b.light.v3.svg",
  "public/watermark-ivanli-b.dark.v3.svg",
] as const;

describe("versioned Logo watermark assets", () => {
  for (const relativePath of watermarkFiles) {
    it(`${relativePath} uses a soft shadow without a dark outline`, async () => {
      const svg = await readFile(resolve(process.cwd(), relativePath), "utf8");
      expect(svg).toContain("<feDropShadow");
      expect(svg).not.toContain('stroke="#14241c"');

      const { data, info } = await sharp(Buffer.from(svg)).png().raw().toBuffer({
        resolveWithObject: true,
      });
      let opaquePixels = 0;
      let shadowPixels = 0;
      let whitePixels = 0;
      for (let offset = 0; offset < data.length; offset += info.channels) {
        const alpha = info.channels === 4 ? data[offset + 3] : 255;
        if (alpha < 24) continue;
        opaquePixels += 1;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        if (red < 130 && green < 130 && blue < 130) shadowPixels += 1;
        if (red > 220 && green > 220 && blue > 220) whitePixels += 1;
      }

      expect(opaquePixels).toBeGreaterThan(0);
      expect(shadowPixels).toBeGreaterThan(0);
      if (relativePath.includes(".dark.")) {
        expect(svg).toContain("#24352d");
      } else {
        expect(whitePixels).toBeGreaterThan(0);
      }
    });
  }
});
