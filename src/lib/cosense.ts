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
 * Extract shared URL from Share Target params.
 * Priority: url > URL in text > title if it looks like URL
 */
export function extractSharedUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  const urlParam = params.get("url")?.trim();
  if (urlParam && isHttpUrl(urlParam)) {
    return urlParam;
  }

  const textParam = params.get("text")?.trim();
  if (textParam) {
    const found = extractUrlFromText(textParam);
    if (found) {
      return found;
    }
  }

  const titleParam = params.get("title")?.trim();
  if (titleParam && isHttpUrl(titleParam)) {
    return titleParam;
  }

  // text may contain URL without url param (some browsers)
  if (textParam && isHttpUrl(textParam)) {
    return textParam;
  }

  return null;
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
