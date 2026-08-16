/**
 * Route generated Cosense links out of the share2cosense PWA.
 *
 * Inside an installed PWA a plain `<a target="_blank">` to an out-of-scope URL is
 * handed to the app's own in-app browser, so Cosense ends up rendered under
 * share2cosense instead of in the browser or in the Cosense PWA. These helpers
 * hand the link to the OS instead, which routes it to whichever app owns
 * scrapbox.io (the Cosense PWA) or to the default browser.
 */

/** User preference for how the "Open in <project>" link is opened. */
export type LinkOpenMode = "auto" | "share" | "newTab";

/** Concrete way a link is opened, resolved from the preference and environment. */
export type OpenStrategy = "intent" | "share" | "newTab";

export type Platform = "android" | "ios" | "other";

export type OpenEnv = {
  /** Running as an installed PWA rather than in a browser tab. */
  standalone: boolean;
  platform: Platform;
  /** navigator.share is usable. */
  canShare: boolean;
};

/** display-mode values that all mean "launched as an installed app". */
const STANDALONE_DISPLAY_MODES = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
];

export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/Android/i.test(userAgent)) {
    return "android";
  }
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return "ios";
  }
  // iPadOS 13+ reports a desktop Macintosh UA and is only told apart by touch
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) {
    return "ios";
  }
  return "other";
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  // iOS Safari exposes the installed-PWA flag here instead of via display-mode
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return STANDALONE_DISPLAY_MODES.some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function currentOpenEnv(): OpenEnv {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints;
  return {
    standalone: isStandaloneDisplay(),
    platform: detectPlatform(userAgent, maxTouchPoints),
    canShare: canShare(),
  };
}

/**
 * In a browser tab a normal new tab is already the right thing: the browser opens
 * it for real, and link capturing can still hand it to the Cosense PWA. Only an
 * installed PWA needs to escape its own in-app browser.
 */
export function resolveOpenStrategy(mode: LinkOpenMode, env: OpenEnv): OpenStrategy {
  if (mode === "newTab") {
    return "newTab";
  }
  if (mode === "share") {
    return env.canShare ? "share" : "newTab";
  }
  if (!env.standalone) {
    return "newTab";
  }
  if (env.platform === "android") {
    return "intent";
  }
  if (env.platform === "ios" && env.canShare) {
    return "share";
  }
  return "newTab";
}

/**
 * Build an Android `intent:` URL for an http(s) link. Navigating to it lets the OS
 * pick the handler: the Cosense PWA when it is installed for scrapbox.io, otherwise
 * the default browser. `browser_fallback_url` keeps the plain URL working when no
 * app claims the link.
 *
 * Returns null when the URL cannot be expressed as an intent, in which case the
 * caller should fall back to opening a new tab.
 */
export function buildAndroidIntentUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const data = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  // ";" separates intent fields, so a URL containing one cannot be encoded safely
  if (data.includes(";")) {
    return null;
  }
  return [
    `intent://${data}#Intent`,
    `scheme=${parsed.protocol.slice(0, -1)}`,
    "action=android.intent.action.VIEW",
    "category=android.intent.category.BROWSABLE",
    `S.browser_fallback_url=${encodeURIComponent(url)}`,
    "end",
  ].join(";");
}

function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function shareUrl(url: string): Promise<boolean> {
  try {
    await navigator.share({ url });
    return true;
  } catch (e) {
    // The user dismissing the sheet is a deliberate cancel, not a failed share
    return e instanceof DOMException && e.name === "AbortError";
  }
}

/**
 * Open a Cosense URL outside the share2cosense PWA.
 *
 * Returns false when nothing special is needed and the click should fall through
 * to the anchor's own new-tab behavior, which keeps the browser's user gesture
 * handling intact.
 */
export function openCosenseUrl(url: string, mode: LinkOpenMode, env = currentOpenEnv()): boolean {
  const strategy = resolveOpenStrategy(mode, env);
  if (strategy === "intent") {
    const intentUrl = buildAndroidIntentUrl(url);
    if (!intentUrl) {
      return false;
    }
    window.location.href = intentUrl;
    return true;
  }
  if (strategy === "share") {
    // navigator.share is called synchronously here so the user gesture still counts
    void shareUrl(url).then((shared) => {
      if (!shared) {
        openInNewTab(url);
      }
    });
    return true;
  }
  return false;
}
