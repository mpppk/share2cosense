import type { Project } from "./db";

type PromptApi = {
  create?: (
    options?: unknown,
  ) => Promise<{ prompt: (text: string) => Promise<string>; destroy?: () => void }>;
  availability?: (options?: unknown) => Promise<string>;
  capabilities?: () => Promise<{ available: string }>;
};

function getPromptApi(): PromptApi | null {
  const g = globalThis as unknown as Record<string, unknown>;
  // New standard: global LanguageModel (Chrome 138+)
  if (g.LanguageModel && typeof (g.LanguageModel as PromptApi).create === "function") {
    return g.LanguageModel as PromptApi;
  }
  if (typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    const lm = w.LanguageModel as PromptApi | undefined;
    if (lm?.create) {
      return lm;
    }
    const ai = w.ai as { languageModel?: PromptApi } | undefined;
    if (ai?.languageModel?.create) {
      return ai.languageModel;
    }
  }
  if (typeof self !== "undefined") {
    const s = self as unknown as Record<string, unknown>;
    const lm = s.LanguageModel as PromptApi | undefined;
    if (lm?.create) {
      return lm;
    }
    const ai = s.ai as { languageModel?: PromptApi } | undefined;
    if (ai?.languageModel?.create) {
      return ai.languageModel;
    }
  }
  // fallback: global ai (e.g. worker global)
  const ai = g.ai as { languageModel?: PromptApi } | undefined;
  if (ai?.languageModel?.create) {
    return ai.languageModel;
  }
  return null;
}

export type WindowAiAvailability = "available" | "downloadable" | "downloading" | "unavailable";

/**
 * ブラウザAIの実際の可用性を非同期で確認する。
 * APIオブジェクトの存在だけでなく、モデルのDL状態 (availability) も見る。
 */
export async function getWindowAiAvailability(): Promise<WindowAiAvailability> {
  const api = getPromptApi();
  if (!api?.create) {
    return "unavailable";
  }
  if (api.availability) {
    try {
      const status = await api.availability();
      if (
        status === "available" ||
        status === "downloadable" ||
        status === "downloading" ||
        status === "unavailable"
      ) {
        return status;
      }
    } catch {
      // availability 呼び出し失敗は無視して capabilities にフォールバック
    }
  }
  // Legacy API: ai.languageModel.capabilities() -> { available: "readily" | "after-download" | "no" }
  if (api.capabilities) {
    try {
      const caps = await api.capabilities();
      if (caps) {
        if (caps.available === "readily") return "available";
        if (caps.available === "after-download") return "downloadable";
      }
    } catch {
      // ignore
    }
  }
  return "unavailable";
}

class AiTimeoutError extends Error {
  constructor() {
    super("AI timeout");
    this.name = "AiTimeoutError";
  }
}

async function createSession(
  api: PromptApi,
  systemPrompt: string,
): Promise<{ prompt: (text: string) => Promise<string>; destroy?: () => void }> {
  // New API は initialPrompts、Legacy は systemPrompt
  // 両方を順に試す
  const newOptions = {
    initialPrompts: [{ role: "system", content: systemPrompt }],
  };
  const legacyOptions = {
    systemPrompt,
  };

  try {
    return await api.create!(newOptions);
  } catch {
    // fallback to legacy
  }
  try {
    return await api.create!(legacyOptions);
  } catch {
    // final fallback: no system prompt (some implementations require expectedInputs)
  }
  return await api.create!();
}

export type BrowserAiResult = { text: string | null; error?: string };

/**
 * Run a single prompt against the browser's on-device Prompt API.
 * Returns the reply text, or null with a human-readable error reason.
 */
export async function promptBrowserAiDetailed(
  systemPrompt: string,
  prompt: string,
  timeoutMs: number,
): Promise<BrowserAiResult> {
  const api = getPromptApi();

  if (!api?.create) {
    return { text: null, error: "ブラウザAIが利用できません" };
  }

  try {
    if ((await getWindowAiAvailability()) === "unavailable") {
      return { text: null, error: "ブラウザAIが利用できません" };
    }

    let session: { prompt: (text: string) => Promise<string>; destroy?: () => void };
    try {
      session = await createSession(api, systemPrompt);
    } catch {
      return { text: null, error: "AIセッションを作成できませんでした" };
    }

    try {
      const text = await Promise.race<string>([
        session.prompt(prompt),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new AiTimeoutError()), timeoutMs),
        ),
      ]);
      return text ? { text } : { text: null, error: "AIの応答が空でした" };
    } finally {
      if (session.destroy) {
        try {
          session.destroy();
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    if (e instanceof AiTimeoutError) {
      return { text: null, error: "タイムアウトしました" };
    }
    return { text: null, error: "AIの実行に失敗しました" };
  }
}

/**
 * Run a single prompt against the browser's on-device Prompt API.
 * Returns null when the API is unavailable, times out, or errors.
 */
export async function promptBrowserAi(
  systemPrompt: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> {
  return (await promptBrowserAiDetailed(systemPrompt, prompt, timeoutMs)).text;
}

const PROJECT_SELECT_TIMEOUT_MS = 10000;

/** Parse {"projectName": "..."} out of an AI reply and validate it against projects. */
function parseProjectReply(raw: string | null, projects: Project[]): string | null {
  if (!raw) {
    return null;
  }
  try {
    const match = raw.match(/\{[^}]*projectName[^}]*\}/);
    const jsonStr = match ? match[0] : raw;
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

export type AiSelectResult = { project: string | null; error?: string };

/**
 * Ask the browser's on-device AI to pick the best project for the title.
 * Returns null project with an error reason when selection fails.
 */
export async function selectProjectWithAi(
  projects: Project[],
  title: string,
): Promise<AiSelectResult> {
  if (projects.length === 0) {
    return { project: null };
  }
  if ((await getWindowAiAvailability()) === "unavailable") {
    return { project: null, error: "ブラウザAIが利用できません" };
  }

  const projectList = projects
    .map((p) => `- name: ${p.name}${p.description ? `, description: ${p.description}` : ""}`)
    .join("\n");

  const prompt = `プロジェクト一覧:
${projectList}

記事タイトル: "${title}"

descriptionが空のプロジェクトはnameだけで判断してください。
最適なprojectのnameをJSON {"projectName": "..."} で1つだけ返してください。日本語で考えてください。`;

  const { text, error } = await promptBrowserAiDetailed(
    "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧と記事タイトルから最適なプロジェクトを1つ選びます。",
    prompt,
    PROJECT_SELECT_TIMEOUT_MS,
  );

  if (!text) {
    return { project: null, error: error ?? "AIの応答がありませんでした" };
  }

  const candidate = parseProjectReply(text, projects);
  if (!candidate) {
    return { project: null, error: "AIの応答を解釈できませんでした" };
  }
  return { project: candidate };
}
