import * as OV from "./online-3d-viewer.js";

function colorFromCss(value, fallback) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return new OV.RGBColor(
      Number.parseInt(hex[1].slice(0, 2), 16),
      Number.parseInt(hex[1].slice(2, 4), 16),
      Number.parseInt(hex[1].slice(4, 6), 16)
    );
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (rgb) return new OV.RGBColor(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  return fallback;
}

class FluxPurrModelViewer extends HTMLElement {
  connectedCallback() {
    if (this.viewer) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host { display:block; width:100%; height:100%; background:transparent; } #viewer { width:100%; height:100%; background:transparent; } canvas { display:block; width:100%; height:100%; background:transparent; }`;
    const mount = document.createElement("div");
    mount.id = "viewer";
    shadow.append(style, mount);
    try {
      const themeText = getComputedStyle(document.documentElement).getPropertyValue(
        "--nature-text"
      );
      const themeAccent = getComputedStyle(document.documentElement).getPropertyValue(
        "--nature-accent"
      );
      const edgeColor = colorFromCss(themeText, new OV.RGBColor(56, 72, 64));
      const modelColor = colorFromCss(themeAccent, new OV.RGBColor(154, 162, 158));
      this.viewer = new OV.EmbeddedViewer(mount, {
        backgroundColor: new OV.RGBAColor(0, 0, 0, 0),
        defaultColor: modelColor,
        defaultLineColor: edgeColor,
        edgeSettings: new OV.EdgeSettings(true, edgeColor, 15),
        onModelLoaded: () => {
          this.viewer.GetViewer().SetModelColor(modelColor);
          this.dispatchEvent(new CustomEvent("model-ready", { bubbles: true }));
        },
        onModelLoadFailed: () =>
          this.dispatchEvent(new CustomEvent("model-error", { bubbles: true })),
      });
      this.viewer.LoadModelFromUrlList([this.getAttribute("model-url")]);
    } catch (error) {
      this.setAttribute("data-error", error instanceof Error ? error.message : String(error));
      console.error("Flux Purr model viewer failed", error);
      this.dispatchEvent(new CustomEvent("model-error", { bubbles: true }));
    }
  }
}

if (!customElements.get("flux-purr-model-viewer")) {
  customElements.define("flux-purr-model-viewer", FluxPurrModelViewer);
}
