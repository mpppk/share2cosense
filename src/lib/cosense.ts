import { truncateText } from "./xPost";

/**
 * Build Cosense page creation URL.
 * Cosense creates a page when navigating to /<project>/<encodedTitle>.
 * With ?body=, the body is prefilled (already exists → appended).
 */
export function buildCosenseUrl(project: string, title: string, bodyUrl: string): string {
  const encodedTitle = encodeURIComponent(title).replace(/%20/g, "_");
  const encodedBody = encodeURIComponent(bodyUrl);
  return `https://scrapbox.io/${project}/${encodedTitle}?body=${encodedBody}`;
}

/**
 * Drop the ?body= query from a URL built by buildCosenseUrl,
 * leaving a plain page URL without a prefilled body.
 */
export function stripCosenseBody(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Max length of the shared text embedded into the body.
 * Percent-encoding inflates the URL ~3x for Japanese text, and Safari's URL
 * limit is around 80,000 chars, so 8000 chars leaves enough headroom.
 */
export const SHARED_TEXT_MAX_LENGTH = 8000;

export type SharedContent = {
  url: string | null;
  text: string | null;
  title: string | null;
};

/**
 * Extract shared URL and text from Share Target params.
 *
 * URL priority: url > URL in text > title if it looks like URL.
 * Text is the raw `text` param (may be null when only a URL was shared, or
 * when the `text` param is the URL itself — Android sends the URL in `text`).
 * Title is the raw `title` param (may be null when not sent).
 */
export function extractSharedContent(search: string): SharedContent {
  const params = new URLSearchParams(search);
  let url: string | null = null;

  const urlParam = params.get("url")?.trim();
  if (urlParam && isHttpUrl(urlParam)) {
    url = urlParam;
  }

  const textParam = params.get("text")?.trim();
  if (textParam && !url) {
    const found = extractUrlFromText(textParam);
    if (found) {
      url = found;
    }
  }

  if (!url) {
    const titleParam = params.get("title")?.trim();
    if (titleParam && isHttpUrl(titleParam)) {
      url = titleParam;
    }
  }

  // text may contain URL without url param (some browsers)
  if (textParam && !url && isHttpUrl(textParam)) {
    url = textParam;
  }

  const titleParamRaw = params.get("title")?.trim();
  const sharedTitle =
    titleParamRaw && !isHttpUrl(titleParamRaw) ? truncateText(titleParamRaw, 500) : null;

  // URLだけがtextとして渡された場合はテキストとしては扱わない
  const sharedText =
    textParam && textParam !== url ? truncateText(textParam, SHARED_TEXT_MAX_LENGTH) : null;

  return {
    url,
    text: sharedText,
    title: sharedTitle,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    return null;
  }
  // Trim trailing punctuation that is not part of URL
  let url = match[0];
  url = url.replace(/[.,!?;:)'"\]]+$/, "");
  return isHttpUrl(url) ? url : null;
}
