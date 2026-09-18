import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Project } from "./db";
import { selectProjectWithSettings } from "./selectProject";

const projects: Project[] = [
  { name: "tech-blog", description: "技術記事", isPublic: false },
  { name: "cooking", description: "", isPublic: false },
];

const base = {
  projects,
  title: "React入門",
  openRouterApiKey: "sk-or-test",
  openRouterModel: "google/gemma-4-26b-a4b-it:free",
};

function mockFetchOnce(body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function requestedUrl(fn: ReturnType<typeof vi.fn>): string {
  return (fn.mock.calls[0] as [string, RequestInit])[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectProjectWithSettings", () => {
  it("uses chat completions when Jev is off", async () => {
    const fn = mockFetchOnce({
      choices: [{ message: { content: '{"projectName": "tech-blog"}' } }],
    });
    const result = await selectProjectWithSettings({
      ...base,
      aiProvider: "openRouter",
      useJev: false,
    });
    expect(result).toEqual({ project: "tech-blog" });
    expect(requestedUrl(fn)).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("uses the Decisions endpoint when Jev is on", async () => {
    const fn = mockFetchOnce({
      answers: { project: { type: "choice", choice: "tech-blog", confidence: 0.9 } },
    });
    const result = await selectProjectWithSettings({
      ...base,
      aiProvider: "openRouter",
      useJev: true,
    });
    expect(result).toEqual({ project: "tech-blog" });
    expect(requestedUrl(fn)).toBe("https://openrouter.ai/api/alpha/decisions");
  });

  it("reports a low-confidence pick as a notice instead of a selection", async () => {
    mockFetchOnce({
      answers: { project: { type: "choice", choice: "cooking", confidence: 0.31 } },
    });
    const result = await selectProjectWithSettings({
      ...base,
      aiProvider: "openRouter",
      useJev: true,
    });
    expect(result.project).toBeNull();
    expect(result.error).toBeUndefined();
    expect(result.notice).toBe(
      "確信度が低いため自動選択を見送りました（候補: cooking、確信度 31%）",
    );
  });

  it("passes a Jev failure through as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Rate limited" } }), { status: 429 }),
      ),
    );
    const result = await selectProjectWithSettings({
      ...base,
      aiProvider: "openRouter",
      useJev: true,
    });
    expect(result.project).toBeNull();
    expect(result.error).toBe("レート制限中です");
    expect(result.notice).toBeUndefined();
  });

  it("selects nothing without calling out when the provider is none", async () => {
    const fn = mockFetchOnce({});
    const result = await selectProjectWithSettings({ ...base, aiProvider: "none", useJev: true });
    expect(result).toEqual({ project: null });
    expect(fn).not.toHaveBeenCalled();
  });
});
