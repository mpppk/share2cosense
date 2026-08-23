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
  /**
   * URL the origin request landed on after the proxy followed redirects.
   * Empty when the proxy predates the field or no redirect was observable.
   */
  finalUrl: string;
};

/**
 * Budget for the whole title lookup, shared by every request in the fallback
 * chain so a dead site cannot stack one timeout on top of the next.
 *
 * Generous because the proxy renders client-side pages in a headless browser
 * before it can answer: a cold render takes several seconds, and a 5s budget
 * cut it off just short of returning (that is what left SPAs such as
 * z.ai/blog/* titleless). Warm responses are unaffected — they arrive in well
 * under a second and the budget is never reached.
 */
export const TITLE_LOOKUP_BUDGET_MS = 20000;

/** Signal shared across one title lookup. Pass the same one to every attempt. */
export function createLookupSignal(budgetMs: number = TITLE_LOOKUP_BUDGET_MS): AbortSignal {
  return AbortSignal.timeout(budgetMs);
}

function toProxyUrl(rawUrl: string, as: string): string {
  const url = new URL(rawUrl);
  const hostAndPath = `${url.host}${url.pathname}${url.search}`;
  const separator = url.search ? "&" : "?";
  return `https://fetch.nibo.sh/${hostAndPath}${separator}as=${as}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** True when neither og:title nor <title> could be read — no title to show. */
export function hasNoTitle(meta: PageMeta): boolean {
  return !meta.ogTitle && !meta.title;
}

/**
 * Fetch <title> and OGP metadata for a URL.
 * Returns null when the page cannot be fetched, so callers can fall back.
 *
 * A successful response whose keys are all empty is still returned as-is: the
 * endpoint worked, the page simply exposes no metadata, and the caller decides
 * what to do about the missing title.
 */
export async function fetchPageMeta(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<PageMeta | null> {
  try {
    const res = await fetch(toProxyUrl(rawUrl, "meta"), {
      signal: signal ?? createLookupSignal(),
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
      finalUrl: asString(data.finalUrl),
    };
  } catch {
    return null;
  }
}

function unquote(value: string): string {
  const match = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
  return (match ? match[1] : value).trim();
}

/**
 * Pull a title out of the proxy's markdown output.
 *
 * The proxy emits YAML front matter with a `title:` key when its extractor
 * found one; otherwise the first `# ` heading is the article title. Exported
 * for the fallback path in fetchTitle, and kept pure so it can be reasoned
 * about without a network round trip.
 */
export function parseMarkdownTitle(markdown: string): string | null {
  let body = markdown;

  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (frontMatter) {
    body = markdown.slice(frontMatter[0].length);
    const titleLine = frontMatter[1].match(/^title:[ \t]*(.+)$/m);
    if (titleLine) {
      const title = unquote(titleLine[1].trim());
      if (title) {
        return title;
      }
    }
  }

  const heading = body.match(/^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m);
  const headingText = heading?.[1].trim();
  return headingText || null;
}

/**
 * Fetch the title via as=md as a last resort, for pages that render a heading
 * but expose no title in their head at all.
 * Returns null when the page cannot be converted or carries no title.
 */
export async function fetchMarkdownTitle(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(toProxyUrl(rawUrl, "md"), {
      signal: signal ?? createLookupSignal(),
    });

    if (!res.ok) {
      return null;
    }

    return parseMarkdownTitle(await res.text());
  } catch {
    return null;
  }
}
