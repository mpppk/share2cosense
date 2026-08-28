import { OPENROUTER_FALLBACK_MODEL } from "../config";
import type { Project } from "./db";
import { X_TITLE_MAX_LENGTH } from "./xPost";

/**
 * Post a chat completion request to OpenRouter and return the reply text
 * with a human-readable error reason on failure.
 */
async function postOpenRouterChatDetailed(
  apiKey: string,
  timeoutMs: number,
  body: Record<string, unknown>,
): Promise<{ content: string | null; error?: string }> {
  if (!apiKey.trim()) {
    return { content: null, error: "APIキーが未設定です" };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer":
          typeof window !== "undefined" ? window.location.origin : "app://share2cosense",
        "X-Title": "share2cosense",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const reason =
        res.status === 401
          ? "APIキーが無効です"
          : res.status === 402
            ? "クレジットが不足しています"
            : res.status === 429
              ? "レート制限中です"
              : `APIエラー(HTTP ${res.status})`;
      return { content: null, error: reason };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const content = data.choices?.[0]?.message?.content ?? null;
    if (!content) {
      return {
        content: null,
        error: data.error?.message
          ? `AIの応答が空でした(${data.error.message})`
          : "AIの応答が空でした",
      };
    }
    return { content };
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { content: null, error: "タイムアウトしました" };
    }
    return { content: null, error: "ネットワークエラー" };
  }
}

/**
 * Post a chat completion request to OpenRouter and return the reply text.
 * Returns null when the key is missing, the request fails, or it times out.
 */
async function postOpenRouterChat(
  apiKey: string,
  timeoutMs: number,
  body: Record<string, unknown>,
): Promise<string | null> {
  return (await postOpenRouterChatDetailed(apiKey, timeoutMs, body)).content;
}

/**
 * Run a single prompt against OpenRouter's chat completions API.
 * Returns the reply text with a human-readable error reason on failure.
 */
export async function promptOpenRouterDetailed(
  systemPrompt: string,
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<{ content: string | null; error?: string }> {
  if (!apiKey.trim()) {
    return { content: null, error: "APIキーが未設定です" };
  }
  if (!model.trim()) {
    return { content: null, error: "モデルが未設定です" };
  }

  return postOpenRouterChatDetailed(apiKey, timeoutMs, {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });
}

/**
 * Run a single prompt against OpenRouter's chat completions API.
 * Returns null when the key/model is missing, the request fails, or it times out.
 */
export async function promptOpenRouter(
  systemPrompt: string,
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  if (!apiKey.trim() || !model.trim()) {
    return null;
  }

  return postOpenRouterChat(apiKey, timeoutMs, {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });
}

const CHATGPT_TITLE_TIMEOUT_MS = 15000;

/** Extract a title from the fallback model's reply. JSON is preferred, but a
 * short bare title is accepted too (some models ignore the JSON instruction). */
export function parseTitleReply(content: string | null): string | null {
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/\{[^{}]*"title"[^{}]*\}/);
  const jsonStr = match ? match[0] : trimmed;

  try {
    const parsed = JSON.parse(jsonStr) as { title?: unknown };
    return typeof parsed.title === "string" ? parsed.title.trim() || null : null;
  } catch {
    const looksLikeJson = /[{}]/.test(trimmed);
    const isMultiline = /[\r\n]/.test(trimmed);
    // Rough length bound only, so code-unit counting is fine here.
    const tooLong = trimmed.length > X_TITLE_MAX_LENGTH * 2;
    if (looksLikeJson || isMultiline || tooLong) {
      return null;
    }
    return trimmed.replace(/^["'「『“”]+|["'」』“”]+$/g, "").trim() || null;
  }
}

/**
 * Fetch the title of a ChatGPT share URL via a browsing-capable model.
 *
 * ChatGPT blocks fetch proxies, so the regular metadata lookup comes up empty.
 * OpenAI's own models can still read the page, so we ask the lowest-effort
 * GPT-5.6 Luna (with OpenRouter's web plugin) to visit the URL and report just
 * the title. Returns null when the key is missing or the request fails.
 */
export async function fetchChatGptSharedTitle(
  rawUrl: string,
  apiKey: string,
): Promise<string | null> {
  return parseTitleReply(
    await postOpenRouterChat(apiKey, CHATGPT_TITLE_TIMEOUT_MS, {
      model: OPENROUTER_FALLBACK_MODEL,
      // Lowest supported reasoning effort; "minimal" still allows the tool use
      // (web plugin) needed to read the page. "none" would disable it.
      reasoning_effort: "minimal",
      plugins: [{ id: "web", max_results: 1 }],
      max_completion_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "あなたはWebページのタイトルを調査するアシスタントです。指定されたURLを実際に開いて確認し、ページのタイトルだけを回答します。",
        },
        {
          role: "user",
          content: `次のURLのページタイトルを調査してください。URLを開いて表示されるタイトルをそのまま答えてください。タイトル以外の説明やコメントは不要です。\nURL: ${rawUrl}\n\n{"title": "..."} の形式でタイトルだけを返してください。`,
        },
      ],
    }),
  );
}

const PROJECT_SELECT_TIMEOUT_MS = 15000;

export type OpenRouterSelectResult = { project: string | null; error?: string };

/** Parse {"projectName": "..."} out of an AI reply and validate it against projects. */
function parseProjectReply(content: string, projects: Project[]): string | null {
  try {
    const match = content.match(/\{[^}]*projectName[^}]*\}/);
    const jsonStr = match ? match[0] : content;
    const parsed = JSON.parse(jsonStr) as { projectName?: string };
    const candidate = parsed.projectName?.trim();
    if (candidate && projects.some((p) => p.name === candidate)) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ask OpenRouter to pick the best project for the title.
 * Returns null project with an error reason when selection fails.
 */
export async function selectProjectWithOpenRouter(
  projects: Project[],
  title: string,
  apiKey: string,
  model: string,
): Promise<OpenRouterSelectResult> {
  if (projects.length === 0) {
    return { project: null };
  }

  const projectList = projects
    .map((p) => `- name: ${p.name}${p.description ? `, description: ${p.description}` : ""}`)
    .join("\n");

  const prompt = `あなたはCosenseプロジェクト選択AIです。プロジェクト一覧と記事タイトルから最適なプロジェクトを1つ選びます。

プロジェクト一覧:
${projectList}

記事タイトル: "${title}"

descriptionが空のプロジェクトはnameだけで判断してください。
最適なprojectのnameをJSON {"projectName": "..."} で1つだけ返してください。日本語で考えてください。`;

  const { content, error } = await postOpenRouterChatDetailed(apiKey, PROJECT_SELECT_TIMEOUT_MS, {
    model,
    messages: [
      {
        role: "system",
        content:
          "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧とタイトルから最適なprojectを選び、JSONで回答します。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  if (!content) {
    return { project: null, error: error ?? "AIの応答がありませんでした" };
  }

  const candidate = parseProjectReply(content, projects);
  if (!candidate) {
    return { project: null, error: "AIの応答を解釈できませんでした" };
  }
  return { project: candidate };
}
