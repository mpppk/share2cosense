import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { JEV_MODEL } from "../config";
import type { Project } from "./db";
import { selectProjectWithJev } from "./jevSelect";

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

function choiceAnswer(choice: string, confidence?: number): unknown {
  return {
    model: JEV_MODEL,
    answers: {
      project: { type: "choice", choice, ...(confidence === undefined ? {} : { confidence }) },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectProjectWithJev", () => {
  it("returns the selected project on a confident answer", async () => {
    mockFetchOnce(200, choiceAnswer("tech-blog", 0.9));
    const result = await selectProjectWithJev(projects, "React入門", "sk-or-test");
    expect(result).toEqual({ project: "tech-blog", confidence: 0.9 });
  });

  it("posts a choice question to the Decisions endpoint", async () => {
    const fn = mockFetchOnce(200, choiceAnswer("tech-blog", 1));
    await selectProjectWithJev(projects, "React入門", "sk-or-test");

    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(init.body as string) as {
      model: string;
      state: { title: string };
      questions: { project: { type: string; criteria: Record<string, string | null> } };
    };
    expect(body.model).toBe(JEV_MODEL);
    expect(body.state).toEqual({ title: "React入門" });
    expect(body.questions.project.type).toBe("choice");
    // A project without a description is sent as null so the model judges by name.
    expect(body.questions.project.criteria).toEqual({ "tech-blog": "技術記事", cooking: null });
  });

  it("sends the API key as a bearer token", async () => {
    const fn = mockFetchOnce(200, choiceAnswer("tech-blog", 1));
    await selectProjectWithJev(projects, "React入門", "sk-or-test");
    const [, init] = fn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
  });

  it("withholds the pick when confidence is below the threshold", async () => {
    mockFetchOnce(200, choiceAnswer("tech-blog", 0.2));
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result).toEqual({
      project: null,
      lowConfidenceProject: "tech-blog",
      confidence: 0.2,
    });
  });

  it("treats a missing confidence as confident", async () => {
    mockFetchOnce(200, choiceAnswer("cooking"));
    const result = await selectProjectWithJev(projects, "肉じゃがの作り方", "key");
    expect(result).toEqual({ project: "cooking", confidence: 1 });
  });

  it("rejects a choice that is not a known project", async () => {
    mockFetchOnce(200, choiceAnswer("unknown", 1));
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.project).toBeNull();
    expect(result.error).toBe("AIの応答が空でした");
  });

  it("rejects a response with no answer for the question", async () => {
    mockFetchOnce(200, { model: JEV_MODEL, answers: {} });
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.project).toBeNull();
    expect(result.error).toBe("AIの応答が空でした");
  });

  it("returns an auth error reason on 401", async () => {
    mockFetchOnce(401, { error: { message: "Invalid key" } });
    const result = await selectProjectWithJev(projects, "React入門", "bad-key");
    expect(result.project).toBeNull();
    expect(result.error).toBe("APIキーが無効です");
  });

  it("returns a credit error reason on 402", async () => {
    mockFetchOnce(402, { error: { message: "No credits" } });
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.error).toBe("クレジットが不足しています");
  });

  it("returns a rate limit error reason on 429", async () => {
    mockFetchOnce(429, { error: { message: "Rate limited" } });
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.error).toBe("レート制限中です");
  });

  it("returns a timeout reason when the request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.project).toBeNull();
    expect(result.error).toBe("タイムアウトしました");
  });

  it("returns a network error reason when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await selectProjectWithJev(projects, "React入門", "key");
    expect(result.error).toBe("ネットワークエラー");
  });

  it("returns a missing-key reason without calling fetch", async () => {
    const fn = mockFetchOnce(200, {});
    const result = await selectProjectWithJev(projects, "React入門", "  ");
    expect(result.project).toBeNull();
    expect(result.error).toBe("APIキーが未設定です");
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns no error when there are no projects", async () => {
    const fn = mockFetchOnce(200, {});
    const result = await selectProjectWithJev([], "React入門", "key");
    expect(result).toEqual({ project: null });
    expect(fn).not.toHaveBeenCalled();
  });
});
