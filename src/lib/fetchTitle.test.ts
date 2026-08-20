import { describe, expect, it } from "vite-plus/test";
import { isChatGptShareUrl } from "./fetchTitle";

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
