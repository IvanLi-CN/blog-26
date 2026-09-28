const BOOT_FLAG = "__publicReadingViewportBooted";

function syncReadingViewportWidth() {
  const viewportWidth = document.documentElement.clientWidth;
  document.documentElement.style.setProperty(
    "--nature-reading-viewport-width",
    `${viewportWidth}px`
  );
  document.documentElement.style.setProperty(
    "--nature-reading-viewport-half-width",
    `${viewportWidth / 2}px`
  );
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const scopedWindow = window as Window & { [BOOT_FLAG]?: boolean };
  if (!scopedWindow[BOOT_FLAG]) {
    scopedWindow[BOOT_FLAG] = true;
    syncReadingViewportWidth();
    window.addEventListener("resize", syncReadingViewportWidth, { passive: true });
    document.addEventListener("astro:after-swap", syncReadingViewportWidth);
    document.addEventListener("astro:page-load", syncReadingViewportWidth);
  }
}
