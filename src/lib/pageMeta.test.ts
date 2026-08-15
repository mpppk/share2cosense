import { describe, expect, it } from "vite-plus/test";
import { hasNoTitle, parseMarkdownTitle, type PageMeta } from "./pageMeta";

function meta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    title: "",
    ogTitle: "",
    ogDescription: "",
    ogSiteName: "",
    ogImage: "",
    description: "",
    ...overrides,
  };
}

describe("hasNoTitle", () => {
  it("is true when neither og:title nor <title> was found", () => {
    expect(hasNoTitle(meta())).toBe(true);
  });

  it("is true when only non-title metadata was found", () => {
    expect(hasNoTitle(meta({ ogImage: "https://example.com/x.png" }))).toBe(true);
  });

  it("is false when either title is present", () => {
    expect(hasNoTitle(meta({ title: "Example Domain" }))).toBe(false);
    expect(hasNoTitle(meta({ ogTitle: "Example Domain" }))).toBe(false);
  });
});

describe("parseMarkdownTitle", () => {
  it("reads a quoted title from YAML front matter", () => {
    const markdown = ["---", 'title: "GLM-5.3: Frontier Coding"', "---", "", "body"].join("\n");
    expect(parseMarkdownTitle(markdown)).toBe("GLM-5.3: Frontier Coding");
  });

  it("reads an unquoted title alongside other front matter keys", () => {
    const markdown = [
      "---",
      "source: https://example.com",
      "title: Plain Title",
      "---",
      "body",
    ].join("\n");
    expect(parseMarkdownTitle(markdown)).toBe("Plain Title");
  });

  it("handles CRLF line endings", () => {
    expect(parseMarkdownTitle("---\r\ntitle: CRLF Title\r\n---\r\n\r\nbody")).toBe("CRLF Title");
  });

  it("falls through to the first heading when the front matter title is empty", () => {
    const markdown = ["---", "title:", "---", "", "# Heading Title", "", "body"].join("\n");
    expect(parseMarkdownTitle(markdown)).toBe("Heading Title");
  });

  it("uses the first h1 when there is no front matter", () => {
    expect(parseMarkdownTitle("# Article Title\n\nbody text")).toBe("Article Title");
  });

  it("strips the trailing hashes of a closed ATX heading", () => {
    expect(parseMarkdownTitle("# Article Title ###\n\nbody")).toBe("Article Title");
  });

  it("finds a heading that is not the first line", () => {
    expect(parseMarkdownTitle("2026-08-14 · Research\n\n# Later Title\n\nbody")).toBe(
      "Later Title",
    );
  });

  it("ignores headings below h1", () => {
    expect(parseMarkdownTitle("## Sub\n\nbody")).toBeNull();
  });

  it("returns null when the article carries no title", () => {
    expect(
      parseMarkdownTitle("This domain is for use in examples.\n\n[Learn more](http://x)"),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseMarkdownTitle("")).toBeNull();
  });
});
