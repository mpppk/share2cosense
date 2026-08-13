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

// 旧 window.ai と新 LanguageModel の両方に対応する存在チェック（同期）
// 実際の可用性（モデルDL状態）は selectProjectWithAi 内で非同期に確認
export function isWindowAiAvailable(): boolean {
  const api = getPromptApi();
  return !!api?.create;
}

// 後方互換エイリアス（新コードからは isWindowAiAvailable を使う）
export const isLanguageModelAvailable = isWindowAiAvailable;

async function isApiUnavailable(api: PromptApi): Promise<boolean> {
  // New API: LanguageModel.availability() -> "available" | "downloadable" | "downloading" | "unavailable"
  if (api.availability) {
    try {
      const status = await api.availability();
      // 文字列が直接返るケースと、オブジェクトで返るケースの両方に対応
      if (typeof status === "string") {
        if (status === "unavailable" || status === "no") {
          return true;
        }
        // "available" | "downloadable" | "downloading" は利用試行を許可
        return false;
      }
      const s = (status as unknown as { available?: string })?.available;
      if (s === "unavailable" || s === "no") {
        return true;
      }
    } catch {
      // availability 呼び出し失敗は無視して capabilities にフォールバック
    }
  }
  // Legacy API: ai.languageModel.capabilities() -> { available: "readily" | "after-download" | "no" }
  if (api.capabilities) {
    try {
      const caps = await api.capabilities();
      if (caps && (caps.available === "no" || caps.available === "unavailable")) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
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

export async function selectProjectWithAi(
  projects: Project[],
  title: string,
): Promise<string | null> {
  const api = getPromptApi();

  if (!api?.create) {
    return null;
  }

  try {
    if (await isApiUnavailable(api)) {
      return null;
    }

    const session = await createSession(
      api,
      "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧と記事タイトルから最適なプロジェクトを1つ選びます。",
    );

    const projectList = projects
      .map((p) => `- name: ${p.name}${p.description ? `, description: ${p.description}` : ""}`)
      .join("\n");

    const prompt = `プロジェクト一覧:
${projectList}

記事タイトル: "${title}"

descriptionが空のプロジェクトはnameだけで判断してください。
最適なprojectのnameをJSON {"projectName": "..."} で1つだけ返してください。日本語で考えてください。`;

    const raw = await Promise.race<string>([
      session.prompt(prompt),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 3000)),
    ]);

    if (session.destroy) {
      try {
        session.destroy();
      } catch {
        // ignore
      }
    }

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
