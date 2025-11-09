// Preload Iconify icon sets locally to avoid runtime fetches to api.iconify.design
// This module can run on both server and client. It registers the icon collections
// that our app uses so the Iconify runtime resolves icons without network access.
import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import lineMd from "@iconify-json/line-md/icons.json";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import lucide from "@iconify-json/lucide/icons.json";
// Public UI uses simple-icons (e.g., social links) and admin uses lucide icons broadly.
// Preload both to keep SSR stable without external fetches.
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import simpleIcons from "@iconify-json/simple-icons/icons.json";
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
load(simpleIcons as unknown as IconifyJSON);
load(lucide as unknown as IconifyJSON);
// Other heavy sets are loaded on-demand within admin tools.
