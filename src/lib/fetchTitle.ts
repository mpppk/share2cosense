import { createLookupSignal, fetchMarkdownTitle, fetchPageMeta, hasNoTitle } from "./pageMeta";
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
};

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
 */
export async function fetchTitleSource(rawUrl: string): Promise<TitleSource> {
  const signal = createLookupSignal();
  const meta = await fetchPageMeta(rawUrl, signal);

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
      };
    }
    const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
    return {
      title: markdownTitle ?? rawUrl,
      description,
      titleTag: meta.title,
      ogTitle: meta.ogTitle,
    };
  }

  const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
  return { title: markdownTitle ?? rawUrl, description: "", titleTag: "", ogTitle: "" };
}
