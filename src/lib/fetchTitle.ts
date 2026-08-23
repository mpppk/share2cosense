import {
  createLookupSignal,
  fetchMarkdownTitle,
  fetchPageMeta,
  hasNoTitle,
  type PageMeta,
} from "./pageMeta";
import { fetchChatGptSharedTitle } from "./openRouterSelect";
import { buildXPostTitle, extractXPostText, isXPostUrl } from "./xPost";

export type TitleSource = {
  /**
   * Title to use as-is. For X posts this is the first N characters of the post
   * body; for other pages it is og:title (falling back to <title>).
   * Falls back to the raw URL when nothing could be fetched.
   */
  title: string;
  /**
   * Page description — og:description, or the post body for X posts.
   * Empty when unavailable.
   *
   * Kept separate from `title` so a later step can generate a title from the
   * full text (e.g. via OpenRouter) instead of using the truncated body.
   */
  description: string;
  /** Raw <title> from fetch.nibo.sh?as=meta (for candidate list) */
  titleTag: string;
  /** Raw og:title from fetch.nibo.sh?as=meta (for candidate list) */
  ogTitle: string;
  /**
   * Redirect destination for share.google short links, when the proxy reported
   * one that differs from the shared URL. Empty otherwise.
   */
  resolvedUrl: string;
};

/**
 * True when the URL is a ChatGPT shared conversation.
 * ChatGPT blocks fetch proxies, so such pages need the model-based fallback.
 */
export function isChatGptShareUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const normalized = host.startsWith("www.") ? host.slice(4) : host;
    return (
      (normalized === "chatgpt.com" || normalized === "chat.openai.com") &&
      url.pathname.startsWith("/share/")
    );
  } catch {
    return false;
  }
}

/**
 * True when the URL is a Google share short link (share.google/…).
 * These redirect to the real page, so callers should prefer the resolved
 * destination URL over the short link.
 */
export function isShareGoogleUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.hostname.toLowerCase() === "share.google";
  } catch {
    return false;
  }
}

/**
 * The URL a share.google link resolves to, or "" when it does not apply:
 * non-share.google URLs, proxies without finalUrl support, or a finalUrl
 * that did not move anywhere.
 */
export function resolveShareGoogleUrl(rawUrl: string, meta: PageMeta | null): string {
  if (!meta?.finalUrl || !isShareGoogleUrl(rawUrl)) {
    return "";
  }
  return meta.finalUrl === rawUrl ? "" : meta.finalUrl;
}

/**
 * Optional fallback for pages the fetch proxy cannot read (e.g. ChatGPT share
 * URLs). When enabled, the title is fetched via a browsing-capable OpenRouter
 * model (OPENROUTER_FALLBACK_MODEL) using the given API key.
 */
export type FetchTitleOptions = {
  fallbackOpenRouterApiKey?: string;
};

/**
 * Fetch the title for a URL that the regular metadata lookup could not resolve,
 * via the fallback model. Returns null when unavailable or unsuccessful.
 */
async function fetchFallbackTitle(
  rawUrl: string,
  options: FetchTitleOptions,
): Promise<string | null> {
  const apiKey = options.fallbackOpenRouterApiKey?.trim();
  if (!apiKey || !isChatGptShareUrl(rawUrl)) {
    return null;
  }
  return fetchChatGptSharedTitle(rawUrl, apiKey);
}

/**
 * Fetch the title and description for a URL via fetch-proxy (fetch.nibo.sh?as=meta).
 *
 * X posts get special handling: X puts the author in og:title ("jack (@jack) on X")
 * and the post body in og:description, so the title is built from the body instead.
 *
 * ?as=md is the single fallback, covering both ways as=meta can come up short:
 * the request failing outright, and a page that carries no title in its head at
 * all. That path runs the proxy's own content extraction, so it can still find
 * a heading where the head is empty.
 *
 * Both attempts share one abort signal, so the fallback cannot stack timeouts.
 * The raw URL is the last resort.
 *
 * When options.fallbackOpenRouterApiKey is set and the URL is a ChatGPT share
 * URL (which blocks fetch proxies), a browsing-capable model fetches just the
 * title as a final fallback.
 *
 * share.google short links additionally expose their redirect destination as
 * TitleSource.resolvedUrl, taken from the proxy's finalUrl.
 */
export async function fetchTitleSource(
  rawUrl: string,
  options: FetchTitleOptions = {},
): Promise<TitleSource> {
  const signal = createLookupSignal();
  const meta = await fetchPageMeta(rawUrl, signal);
  const resolvedUrl = resolveShareGoogleUrl(rawUrl, meta);

  if (meta) {
    if (isXPostUrl(rawUrl)) {
      const postText = extractXPostText(meta);
      const xTitle = buildXPostTitle(meta);
      if (xTitle) {
        return {
          title: xTitle,
          description: postText,
          titleTag: meta.title,
          ogTitle: meta.ogTitle,
          resolvedUrl,
        };
      }
    }
    const description = meta.ogDescription || meta.description;
    if (!hasNoTitle(meta)) {
      return {
        title: meta.ogTitle || meta.title,
        description,
        titleTag: meta.title,
        ogTitle: meta.ogTitle,
        resolvedUrl,
      };
    }
    const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
    const fallbackTitle = markdownTitle ? null : await fetchFallbackTitle(rawUrl, options);
    return {
      title: fallbackTitle ?? markdownTitle ?? rawUrl,
      description,
      titleTag: meta.title,
      ogTitle: meta.ogTitle,
      resolvedUrl,
    };
  }

  const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
  const fallbackTitle = markdownTitle ? null : await fetchFallbackTitle(rawUrl, options);
  return {
    title: fallbackTitle ?? markdownTitle ?? rawUrl,
    description: "",
    titleTag: "",
    ogTitle: "",
    resolvedUrl,
  };
}
