/**
 * Page metadata fetched via fetch-proxy (fetch.nibo.sh?as=meta).
 * Keys that could not be extracted are empty strings.
 */
export type PageMeta = {
  title: string;
  ogTitle: string;
  ogDescription: string;
  ogSiteName: string;
  ogImage: string;
  description: string;
};

function toProxyUrl(rawUrl: string, as: string): string {
  const url = new URL(rawUrl);
  const hostAndPath = `${url.host}${url.pathname}${url.search}`;
  const separator = url.search ? "&" : "?";
  return `https://fetch.nibo.sh/${hostAndPath}${separator}as=${as}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Fetch <title> and OGP metadata for a URL.
 * Returns null when the page cannot be fetched or the proxy does not support as=meta,
 * so callers can fall back to as=title.
 */
export async function fetchPageMeta(rawUrl: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(toProxyUrl(rawUrl, "meta"), {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const data = raw as Record<string, unknown>;
    return {
      title: asString(data.title),
      ogTitle: asString(data.ogTitle),
      ogDescription: asString(data.ogDescription),
      ogSiteName: asString(data.ogSiteName),
      ogImage: asString(data.ogImage),
      description: asString(data.description),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the plain title via as=title. Used as a fallback when as=meta is unavailable.
 * Returns null when the page cannot be fetched or the title is empty.
 */
export async function fetchPlainTitle(rawUrl: string): Promise<string | null> {
  try {
    const res = await fetch(toProxyUrl(rawUrl, "title"), {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}
