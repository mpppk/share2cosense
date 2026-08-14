import type { PageMeta } from "./pageMeta";

/**
 * X (Twitter) post support.
 *
 * X serves the author in og:title ("jack (@jack) on X") and the post body in
 * og:description, so using og:title as-is makes every post share the same title.
 * We build the title from the post body instead.
 *
 * Note: X truncates og:description at roughly 280 characters, so long-form posts
 * are cut off at the source. Normal posts fit entirely.
 */

/** Max length of the generated title. Longer bodies are truncated with an ellipsis. */
export const X_TITLE_MAX_LENGTH = 60;

const X_HOSTS = new Set(["x.com", "twitter.com"]);
const X_HOST_PREFIXES = ["www.", "mobile.", "m."];
const X_POST_PATH = /^\/(?:i\/web\/status|[A-Za-z0-9_]{1,15}\/status(?:es)?)\/\d+/;

function normalizeHost(host: string): string {
  const lower = host.toLowerCase();
  for (const prefix of X_HOST_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return lower.slice(prefix.length);
    }
  }
  return lower;
}

/** True when the URL points at a single X post. */
export function isXPostUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return X_HOSTS.has(normalizeHost(url.host)) && X_POST_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Post body extracted from the page metadata, collapsed to a single line.
 * Returns "" when the post has no text (e.g. an image-only post).
 */
export function extractXPostText(meta: PageMeta): string {
  const raw = meta.ogDescription || meta.description;
  return raw
    .replace(/https?:\/\/t\.co\/\S+/g, "") // drop t.co shortlinks for attached media
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split into grapheme clusters so truncation never cuts an emoji or a combining
 * sequence in half. Falls back to code points where Intl.Segmenter is missing.
 */
function toGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

/** Truncate to maxLength characters, appending an ellipsis when shortened. */
export function truncateTitle(text: string, maxLength: number = X_TITLE_MAX_LENGTH): string {
  const graphemes = toGraphemes(text);
  if (graphemes.length <= maxLength) {
    return text;
  }
  return `${graphemes.slice(0, maxLength).join("").trimEnd()}…`;
}

/**
 * Title for an X post: the first X_TITLE_MAX_LENGTH characters of the post body.
 * Returns null when the post has no text, so callers can fall back to og:title.
 */
export function buildXPostTitle(
  meta: PageMeta,
  maxLength: number = X_TITLE_MAX_LENGTH,
): string | null {
  const text = extractXPostText(meta);
  if (!text) {
    return null;
  }
  return truncateTitle(text, maxLength);
}
