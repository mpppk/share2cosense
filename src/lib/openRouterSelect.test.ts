import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseTitleReply, selectProjectWithOpenRouter } from "./openRouterSelect";
import type { Project } from "./db";

const projects: Project[] = [
  { name: "tech-blog", description: "技術記事", isPublic: false },
  { name: "cooking", description: "", isPublic: false },
];

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectProjectWithOpenRouter", () => {
  it("returns the selected project on a valid JSON reply", async () => {
    mockFetchOnce(200, {
      choices: [{ message: { content: '{"projectName": "tech-blog"}' } }],
    });
    const result = await selectProjectWithOpenRouter(projects, "React入門", "sk-or-test", "m");
    expect(result).toEqual({ project: "tech-blog" });
  });

  it("returns an auth error reason on 401", async () => {
    mockFetchOnce(401, { error: { message: "Invalid key" } });
    const result = await selectProjectWithOpenRouter(projects, "React入門", "bad-key", "m");
    expect(result.project).toBeNull();
    expect(result.error).toBe("APIキーが無効です");
  });

  it("returns a rate limit error reason on 429", async () => {
    mockFetchOnce(429, { error: { message: "Rate limited" } });
    const result = await selectProjectWithOpenRouter(projects, "React入門", "key", "m");
    expect(result.project).toBeNull();
    expect(result.error).toBe("レート制限中です");
  });

  it("returns an unparseable-reply reason when projectName is missing", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: "tech-blog がよいと思います" } }] });
    const result = await selectProjectWithOpenRouter(projects, "React入門", "key", "m");
    expect(result.project).toBeNull();
    expect(result.error).toBe("AIの応答を解釈できませんでした");
  });

  it("returns an unparseable-reply reason when projectName is not in the list", async () => {
    mockFetchOnce(200, { choices: [{ message: { content: '{"projectName": "unknown"}' } }] });
    const result = await selectProjectWithOpenRouter(projects, "React入門", "key", "m");
    expect(result.project).toBeNull();
    expect(result.error).toBe("AIの応答を解釈できませんでした");
  });

  it("returns a missing-key reason without calling fetch", async () => {
    const fn = mockFetchOnce(200, {});
    const result = await selectProjectWithOpenRouter(projects, "React入門", "  ", "m");
    expect(result.project).toBeNull();
    expect(result.error).toBe("APIキーが未設定です");
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns no error when there are no projects", async () => {
    const result = await selectProjectWithOpenRouter([], "React入門", "key", "m");
    expect(result).toEqual({ project: null });
  });
});

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
