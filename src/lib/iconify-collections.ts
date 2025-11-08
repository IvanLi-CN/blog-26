// Preload Iconify icon sets locally to avoid runtime fetches to api.iconify.design
// This module can run on both server and client. It registers the icon collections
// that our app uses so the Iconify runtime resolves icons without network access.
import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import bxl from "@iconify-json/bxl/icons.json";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import carbon from "@iconify-json/carbon/icons.json";
// Additional single-color sets used by the admin icon picker
// These may not exist in all environments; import guarded by try/catch in load()
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import cib from "@iconify-json/cib/icons.json";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import fa6brands from "@iconify-json/fa6-brands/icons.json";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import gameIcons from "@iconify-json/game-icons/icons.json";
import lineMd from "@iconify-json/line-md/icons.json";
// @ts-expect-error Iconify JSON modules lack runtime type exports.
import materialSymbols from "@iconify-json/material-symbols/icons.json";
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
load(carbon as unknown as IconifyJSON);
// Best effort: these packages might be optional in some setups
try {
  load(cib as unknown as IconifyJSON);
} catch {
  /* optional set not installed */
}
try {
  load(fa6brands as unknown as IconifyJSON);
} catch {
  /* optional set not installed */
}
try {
  load(bxl as unknown as IconifyJSON);
} catch {
  /* optional set not installed */
}
try {
  load(materialSymbols as unknown as IconifyJSON);
} catch {
  /* optional set not installed */
}
try {
  load(gameIcons as unknown as IconifyJSON);
} catch {
  /* optional set not installed */
}
