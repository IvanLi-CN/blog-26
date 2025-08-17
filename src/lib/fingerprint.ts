import FingerprintJS from '@fingerprintjs/fingerprintjs';

let visitorId: string | undefined;

/**
 * Generates and returns a stable visitor ID using FingerprintJS.
 * Caches the visitor ID in memory after the first generation.
 * @returns A promise that resolves to the visitor's unique ID.
 */
export async function getVisitorId(): Promise<string> {
  if (visitorId) {
    return visitorId;
  }

  const fp = await FingerprintJS.load();
  const result = await fp.get();
  visitorId = result.visitorId;
  return visitorId;
}
