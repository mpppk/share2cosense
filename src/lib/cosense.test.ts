import { describe, expect, it } from "vite-plus/test";
import { buildCosenseUrl, extractSharedContent, stripCosenseBody } from "./cosense";

describe("buildCosenseUrl", () => {
  it("encodes the title and appends the body", () => {
    expect(buildCosenseUrl("proj", "Hello World", "https://example.com")).toBe(
      "https://scrapbox.io/proj/Hello_World?body=https%3A%2F%2Fexample.com",
    );
  });
});

describe("stripCosenseBody", () => {
  it("drops the body query", () => {
    const url = buildCosenseUrl("proj", "Hello World", "https://example.com");
    expect(stripCosenseBody(url)).toBe("https://scrapbox.io/proj/Hello_World");
  });

  it("keeps a URL that has no query untouched", () => {
    expect(stripCosenseBody("https://scrapbox.io/proj/Hello_World")).toBe(
      "https://scrapbox.io/proj/Hello_World",
    );
  });

  it("keeps the encoded title of a multibyte page", () => {
    const url = buildCosenseUrl("proj", "日本語 タイトル", "本文\nhttps://example.com");
    expect(stripCosenseBody(url)).toBe(
      `https://scrapbox.io/proj/${encodeURIComponent("日本語").replace(/%20/g, "_")}_${encodeURIComponent("タイトル")}`,
    );
  });
});

describe("extractSharedContent", () => {
  it("extracts the URL from text and keeps the rest as text", () => {
    const shared = extractSharedContent("?text=メモ%20https%3A%2F%2Fexample.com%2Farticle");
    expect(shared.url).toBe("https://example.com/article");
    expect(shared.text).toBe("メモ https://example.com/article");
  });

  it("drops text when it is the URL itself", () => {
    const shared = extractSharedContent("?text=https%3A%2F%2Fexample.com%2Farticle");
    expect(shared.url).toBe("https://example.com/article");
    expect(shared.text).toBeNull();
  });

  it("drops text when it equals the url param", () => {
    const shared = extractSharedContent(
      "?url=https%3A%2F%2Fexample.com%2Farticle&text=https%3A%2F%2Fexample.com%2Farticle",
    );
    expect(shared.url).toBe("https://example.com/article");
    expect(shared.text).toBeNull();
  });

  it("keeps text when it differs from the extracted URL", () => {
    const shared = extractSharedContent(
      "?url=https%3A%2F%2Fexample.com%2Farticle&text=%E3%82%B7%E3%82%A7%E3%82%A2%E3%81%97%E3%81%9F%E3%81%84%E3%83%86%E3%82%AD%E3%82%B9%E3%83%88",
    );
    expect(shared.url).toBe("https://example.com/article");
    expect(shared.text).toBe("シェアしたいテキスト");
  });

  it("keeps text with trailing punctuation even when a URL was extracted", () => {
    const shared = extractSharedContent("?text=https%3A%2F%2Fexample.com%2Farticle.");
    expect(shared.url).toBe("https://example.com/article");
    expect(shared.text).toBe("https://example.com/article.");
  });
});
