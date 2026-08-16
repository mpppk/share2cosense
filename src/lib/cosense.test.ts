import { describe, expect, it } from "vite-plus/test";
import { buildCosenseUrl, stripCosenseBody } from "./cosense";

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
