/**
 * Fetch page title via fetch-proxy (fetch.nibk.sh?as=title).
 * Falls back to raw URL if fetch fails or title is empty.
 */
export async function fetchTitle(rawUrl: string): Promise<string> {
  try {
    const url = new URL(rawUrl);
    const hostAndPath = `${url.host}${url.pathname}${url.search}`;
    const separator = url.search ? "&" : "?";
    const proxyUrl = `https://fetch.nibk.sh/${hostAndPath}${separator}as=title`;

    const res = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return rawUrl;
    }

    const text = (await res.text()).trim();
    return text || rawUrl;
  } catch {
    return rawUrl;
  }
}
