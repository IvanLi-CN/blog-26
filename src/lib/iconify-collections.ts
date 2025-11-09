// Preload Iconify icon sets locally to avoid runtime fetches to api.iconify.design
// This module can run on both server and client. It registers the icon collections
// that our app uses so the Iconify runtime resolves icons without network access.
import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import lineMd from "@iconify-json/line-md/icons.json";
import tabler from "@iconify-json/tabler/icons.json";

function load(collection: IconifyJSON) {
  try {
    addCollection(collection);
  } catch {
    // Ignore duplicate registration during hot reloads.
  }
}

load(tabler as unknown as IconifyJSON);
load(lineMd as unknown as IconifyJSON);
// Other heavy sets (e.g., simple-icons, lucide) are loaded on-demand within
// specific routes/components to keep the initial bundle lean.
