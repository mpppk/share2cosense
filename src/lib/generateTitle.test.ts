import { describe, expect, it } from "vite-plus/test";
import { buildPrompt } from "./generateTitle";

describe("buildPrompt", () => {
  it("keeps the default instructions when no custom prompt is configured", () => {
    const prompt = buildPrompt("共有する本文", null);

    expect(prompt).toContain("共有する本文");
    expect(prompt).toContain('JSON {"title": "..."} の形式');
    expect(prompt).not.toContain("追加の指示:");
  });

  it("adds a trimmed custom prompt before the response format instruction", () => {
    const prompt = buildPrompt(
      "共有する本文",
      "https://example.com",
      "  専門用語は英語のまま残してください。  ",
    );

    expect(prompt).toContain("共有元URL: https://example.com");
    expect(prompt).toContain("追加の指示:\n専門用語は英語のまま残してください。");
    expect(prompt.indexOf("追加の指示:")).toBeLessThan(prompt.indexOf('JSON {"title"'));
  });
});
