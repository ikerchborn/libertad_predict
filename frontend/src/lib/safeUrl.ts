/** URL validation helpers for external links and locally hosted place images. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "tel:"]);

/**
 * Accepts HTTP, HTTPS, and telephone links while rejecting unsupported protocols.
 *
 * Relative values resolve against a fixed local base; invalid values return `null`.
 */
export function getSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value, "http://localhost");
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Converts known filesystem image paths to public URLs and preserves HTTP(S) URLs.
 *
 * Unsupported or empty values return `null`.
 */
export function getLocalImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/images/")) return value;

  const marker = "frontend/public/images/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return `/${value.slice(markerIndex + "frontend/public/".length)}`;
  }

  return value.startsWith("http://") || value.startsWith("https://") ? value : null;
}
