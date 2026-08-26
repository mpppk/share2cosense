import { promptBrowserAi } from "./aiSelect";
import type { AiProvider } from "./db";
import { promptOpenRouter } from "./openRouterSelect";
import { X_TITLE_MAX_LENGTH, truncateTitle } from "./xPost";

/**
 * Generate a title from shared text (and optionally the shared URL) using the
 * AI provider configured for project selection. Returns null whenever
 * generation is unavailable or fails, so the caller keeps the
 * leading-characters title.
 */

const TIMEOUT_MS = 8000;

const SYSTEM_PROMPT =
  "あなたは共有されたコンテンツのタイトル生成AIです。本文（と共有元URL）から、内容が一目で分かる簡潔なタイトルを1つ作ります。";

export function buildPrompt(text: string, url: string | null, customPrompt = ""): string {
  const additionalInstructions = customPrompt.trim()
    ? `\n追加の指示:\n${customPrompt.trim()}\n`
    : "";

  return `以下は共有されたコンテンツです。
${url ? `\n共有元URL: ${url}\n` : ""}
"""
${text}
"""

このコンテンツの内容を表すタイトルを1つ作ってください。

- ${X_TITLE_MAX_LENGTH}文字以内
- 本文と同じ言語で書く
- 本文をそのまま切り出すのではなく、内容を要約する
- 鉤括弧や引用符で囲まない
- 「〜について」のような冗長な表現は避ける
${additionalInstructions}

JSON {"title": "..."} の形式で1つだけ返してください。`;
}

function normalize(text: string): string | null {
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'「『“”]+/, "")
    .replace(/["'」』“”]+$/, "")
    .trim();

  if (!cleaned) {
    return null;
  }
  return truncateTitle(cleaned, X_TITLE_MAX_LENGTH);
}

function parseTitle(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/\{[^{}]*"title"[^{}]*\}/);
  const jsonStr = match ? match[0] : trimmed;

  try {
    const parsed = JSON.parse(jsonStr) as { title?: unknown };
    return typeof parsed.title === "string" ? normalize(parsed.title) : null;
  } catch {
    // On-device models often ignore the JSON instruction and answer with a
    // bare title, so accept that — but only when the reply looks like a title
    // rather than prose. A malformed JSON attempt, a multi-line answer, an
    // over-long reply, or a sentence ending in closing punctuation (a refusal
    // such as "申し訳ありませんが…できませんでした。") falls back instead.
    const looksLikeJson = /[{}]/.test(trimmed);
    const isMultiline = /[\r\n]/.test(trimmed);
    const endsLikeSentence = /[。．.!！]$/.test(trimmed);
    // Rough length bound only, so code-unit counting is fine here.
    const tooLong = trimmed.length > X_TITLE_MAX_LENGTH * 2;
    if (looksLikeJson || isMultiline || endsLikeSentence || tooLong) {
      return null;
    }
    return normalize(trimmed);
  }
}

export async function generateTitleFromText(options: {
  text: string;
  url: string | null;
  aiProvider: AiProvider;
  openRouterApiKey: string;
  openRouterModel: string;
  customPrompt?: string;
}): Promise<string | null> {
  const { text, url, aiProvider, openRouterApiKey, openRouterModel, customPrompt } = options;

  const source = text.trim();
  if (!source) {
    return null;
  }

  const prompt = buildPrompt(source, url, customPrompt);
  let raw: string | null = null;

  if (aiProvider === "openRouter") {
    raw = await promptOpenRouter(
      SYSTEM_PROMPT,
      prompt,
      openRouterApiKey,
      openRouterModel,
      TIMEOUT_MS,
    );
  } else if (aiProvider === "windowAi") {
    raw = await promptBrowserAi(SYSTEM_PROMPT, prompt, TIMEOUT_MS);
  }

  if (!raw) {
    return null;
  }
  return parseTitle(raw);
}
