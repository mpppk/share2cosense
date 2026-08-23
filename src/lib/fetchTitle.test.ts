import { describe, expect, it } from "vite-plus/test";
import { isChatGptShareUrl, isShareGoogleUrl, resolveShareGoogleUrl } from "./fetchTitle";
import type { PageMeta } from "./pageMeta";

describe("isChatGptShareUrl", () => {
  it("matches chatgpt.com share URLs", () => {
    expect(
      isChatGptShareUrl("https://chatgpt.com/share/67f1b7f1-1234-5678-9abc-def012345678"),
    ).toBe(true);
  });

  it("matches www.chatgpt.com share URLs", () => {
    expect(
      isChatGptShareUrl("https://www.chatgpt.com/share/67f1b7f1-1234-5678-9abc-def012345678"),
    ).toBe(true);
  });

  it("matches legacy chat.openai.com share URLs", () => {
    expect(
      isChatGptShareUrl("https://chat.openai.com/share/67f1b7f1-1234-5678-9abc-def012345678"),
    ).toBe(true);
  });

  it("rejects chatgpt.com pages that are not shares", () => {
    expect(isChatGptShareUrl("https://chatgpt.com/")).toBe(false);
    expect(isChatGptShareUrl("https://chatgpt.com/gpts")).toBe(false);
  });

  it("rejects other hosts", () => {
    expect(isChatGptShareUrl("https://example.com/share/abc")).toBe(false);
    expect(isChatGptShareUrl("https://chatgpt.com.evil.example/share/abc")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isChatGptShareUrl("not a url")).toBe(false);
    expect(isChatGptShareUrl("")).toBe(false);
  });
});

describe("isShareGoogleUrl", () => {
  it("matches share.google short links", () => {
    expect(isShareGoogleUrl("https://share.google/AIS7zVxyz123")).toBe(true);
    expect(isShareGoogleUrl("https://share.google/abc?usp=sharing")).toBe(true);
  });

  it("rejects other hosts and subdomains", () => {
    expect(isShareGoogleUrl("https://www.share.google/abc")).toBe(false);
    expect(isShareGoogleUrl("https://share.google.evil.example/abc")).toBe(false);
    expect(isShareGoogleUrl("https://google.com/share")).toBe(false);
    expect(isShareGoogleUrl("https://example.com/share.google")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isShareGoogleUrl("not a url")).toBe(false);
    expect(isShareGoogleUrl("")).toBe(false);
  });
});

describe("resolveShareGoogleUrl", () => {
  const meta = (overrides: Partial<PageMeta> = {}): PageMeta => ({
    title: "",
    ogTitle: "",
    ogDescription: "",
    ogSiteName: "",
    ogImage: "",
    description: "",
    finalUrl: "",
    ...overrides,
  });

  it("returns the redirect destination for a share.google URL", () => {
    const m = meta({ finalUrl: "https://maps.example.com/place/123" });
    expect(resolveShareGoogleUrl("https://share.google/abc", m)).toBe(
      "https://maps.example.com/place/123",
    );
  });

  it("returns empty for non-share.google URLs even when finalUrl exists", () => {
    const m = meta({ finalUrl: "https://example.com/real" });
    expect(resolveShareGoogleUrl("https://example.com/", m)).toBe("");
  });

  it("returns empty when the proxy has no finalUrl", () => {
    expect(resolveShareGoogleUrl("https://share.google/abc", meta())).toBe("");
    expect(resolveShareGoogleUrl("https://share.google/abc", null)).toBe("");
  });

  it("returns empty when finalUrl equals the shared URL (no redirect observed)", () => {
    const m = meta({ finalUrl: "https://share.google/abc" });
    expect(resolveShareGoogleUrl("https://share.google/abc", m)).toBe("");
  });
});
