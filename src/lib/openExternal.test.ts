import { describe, expect, it } from "vite-plus/test";
import {
  buildAndroidIntentUrl,
  detectPlatform,
  resolveOpenStrategy,
  type OpenEnv,
} from "./openExternal";

function env(overrides: Partial<OpenEnv> = {}): OpenEnv {
  return { standalone: false, platform: "other", canShare: false, ...overrides };
}

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("detectPlatform", () => {
  it("detects Android", () => {
    expect(detectPlatform(ANDROID_UA, 5)).toBe("android");
  });

  it("detects iPhone", () => {
    expect(detectPlatform(IPHONE_UA, 5)).toBe("ios");
  });

  it("detects iPadOS behind its desktop user agent", () => {
    expect(detectPlatform(MAC_UA, 5)).toBe("ios");
  });

  it("keeps a real Mac as other", () => {
    expect(detectPlatform(MAC_UA, 0)).toBe("other");
  });
});

describe("resolveOpenStrategy", () => {
  it("opens a new tab in a browser tab, where nothing needs escaping", () => {
    expect(resolveOpenStrategy("auto", env({ platform: "android", canShare: true }))).toBe(
      "newTab",
    );
  });

  it("hands the link to Android when installed as a PWA", () => {
    expect(resolveOpenStrategy("auto", env({ standalone: true, platform: "android" }))).toBe(
      "intent",
    );
  });

  it("uses the share sheet on an installed iOS PWA", () => {
    expect(
      resolveOpenStrategy("auto", env({ standalone: true, platform: "ios", canShare: true })),
    ).toBe("share");
  });

  it("falls back to a new tab on iOS without navigator.share", () => {
    expect(resolveOpenStrategy("auto", env({ standalone: true, platform: "ios" }))).toBe("newTab");
  });

  it("keeps a desktop PWA on a new tab instead of the OS share sheet", () => {
    expect(resolveOpenStrategy("auto", env({ standalone: true, canShare: true }))).toBe("newTab");
  });

  it("honors the forced modes", () => {
    expect(resolveOpenStrategy("newTab", env({ standalone: true, platform: "android" }))).toBe(
      "newTab",
    );
    expect(resolveOpenStrategy("share", env({ canShare: true }))).toBe("share");
    expect(resolveOpenStrategy("share", env())).toBe("newTab");
  });
});

describe("buildAndroidIntentUrl", () => {
  it("wraps an https URL with a browser fallback", () => {
    expect(buildAndroidIntentUrl("https://scrapbox.io/proj/Hello_World")).toBe(
      "intent://scrapbox.io/proj/Hello_World#Intent;scheme=https;action=android.intent.action.VIEW;" +
        "category=android.intent.category.BROWSABLE;" +
        "S.browser_fallback_url=https%3A%2F%2Fscrapbox.io%2Fproj%2FHello_World;end",
    );
  });

  it("keeps the query string so the body is still prefilled", () => {
    const intentUrl = buildAndroidIntentUrl(
      "https://scrapbox.io/proj/Hello_World?body=https%3A%2F%2Fexample.com",
    );
    expect(intentUrl).toContain(
      "intent://scrapbox.io/proj/Hello_World?body=https%3A%2F%2Fexample.com#Intent;",
    );
  });

  it("rejects a non-http scheme", () => {
    expect(buildAndroidIntentUrl("javascript:alert(1)")).toBe(null);
  });

  it("rejects a value that is not a URL", () => {
    expect(buildAndroidIntentUrl("not a url")).toBe(null);
  });

  it("rejects a URL whose semicolon would break intent parsing", () => {
    expect(buildAndroidIntentUrl("https://scrapbox.io/proj/a;b")).toBe(null);
  });
});
