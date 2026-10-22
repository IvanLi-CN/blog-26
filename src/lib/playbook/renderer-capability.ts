export const PLAYBOOK_RENDERER_CAPABILITY_PATH =
  "src/lib/playbook/public-package-capabilities.json";

export const PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES = Object.freeze({
  public_catalog_schema_version: 2,
  supplement_schema_version: 1,
});

export function assertPlaybookRendererCapabilities(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Playbook renderer capabilities are missing");
  const capabilities = value as Record<string, unknown>;
  if (
    capabilities.public_catalog_schema_version !==
      PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES.public_catalog_schema_version ||
    capabilities.supplement_schema_version !==
      PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES.supplement_schema_version
  )
    throw new Error("Playbook renderer does not support the current public package");
}
