import {
  createLookupSignal,
  fetchMarkdownTitle,
  fetchPageMeta,
  fetchPlainTitle,
  hasNoTitle,
} from "./pageMeta";
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
};

/**
 * Fetch the title and description for a URL via fetch-proxy (fetch.nibo.sh?as=meta).
 *
 * X posts get special handling: X puts the author in og:title ("jack (@jack) on X")
 * and the post body in og:description, so the title is built from the body instead.
 *
 * Two fallbacks sit behind as=meta, for two different failures:
 *
 * - The request failed outright, or the proxy predates as=meta — retry with
 *   ?as=title, which every deployment understands.
 * - The request succeeded but the page carries no title in its head — ask for
 *   ?as=md and take the title out of the converted article. That path runs the
 *   proxy's own content extraction, so it can still find a heading in pages
 *   whose head is empty.
 *
 * Every attempt shares one abort signal, so the fallbacks cannot stack timeouts.
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
        return { title: xTitle, description: postText };
      }
    }
    const description = meta.ogDescription || meta.description;
    if (!hasNoTitle(meta)) {
      return { title: meta.ogTitle || meta.title, description };
    }
    const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
    return { title: markdownTitle ?? rawUrl, description };
  }

  const plainTitle = await fetchPlainTitle(rawUrl, signal);
  if (plainTitle) {
    return { title: plainTitle, description: "" };
  }

  const markdownTitle = await fetchMarkdownTitle(rawUrl, signal);
  return { title: markdownTitle ?? rawUrl, description: "" };
}
