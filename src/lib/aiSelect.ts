import type { Project } from "./db";

function getAi(): unknown {
  if (typeof window !== "undefined" && "ai" in window) {
    return (window as unknown as { ai: unknown }).ai;
  }
  if (typeof self !== "undefined" && "ai" in self) {
    return (self as unknown as { ai: unknown }).ai;
  }
  return null;
}

export async function selectProjectWithAi(
  projects: Project[],
  title: string,
): Promise<string | null> {
  const ai = getAi() as {
    languageModel?: {
      capabilities?: () => Promise<{ available: string }>;
      create?: (
        options?: unknown,
      ) => Promise<{ prompt: (text: string) => Promise<string>; destroy?: () => void }>;
    };
  } | null;

  if (!ai?.languageModel?.create) {
    return null;
  }

  try {
    if (ai.languageModel.capabilities) {
      const caps = await ai.languageModel.capabilities();
      if (caps && caps.available === "no") {
        return null;
      }
    }

    const session = await ai.languageModel.create({
      systemPrompt:
        "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧と記事タイトルから最適なプロジェクトを1つ選びます。",
    });

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
