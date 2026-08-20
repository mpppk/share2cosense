import { describe, expect, it } from "vite-plus/test";
import { parseTitleReply } from "./openRouterSelect";

describe("parseTitleReply", () => {
  it("extracts a title from a JSON reply", () => {
    expect(parseTitleReply('{"title": "ChatGPT conversation"}')).toBe("ChatGPT conversation");
  });

  it("extracts a title from JSON wrapped in prose", () => {
    expect(parseTitleReply('タイトルは次の通りです。{"title": "共有した会話"}')).toBe(
      "共有した会話",
    );
  });

  it("extracts a title from a longer JSON object", () => {
    expect(parseTitleReply('{"title": "A", "summary": "long text"}')).toBe("A");
  });

  it("accepts a short bare title", () => {
    expect(parseTitleReply("共有した会話")).toBe("共有した会話");
  });

  it("strips surrounding quotes from a bare title", () => {
    expect(parseTitleReply("「共有した会話」")).toBe("共有した会話");
  });

  it("rejects malformed JSON", () => {
    expect(parseTitleReply('{"title": "broken"')).toBeNull();
  });

  it("rejects multi-line prose", () => {
    expect(parseTitleReply("1行目\n2行目")).toBeNull();
  });

  it("rejects over-long prose", () => {
    expect(parseTitleReply("x".repeat(121))).toBeNull();
  });

  it("returns null for empty replies", () => {
    expect(parseTitleReply("")).toBeNull();
    expect(parseTitleReply(null)).toBeNull();
  });
});
