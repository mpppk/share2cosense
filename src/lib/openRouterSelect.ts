import type { Project } from "./db";

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

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "share2cosense",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export async function selectProjectWithOpenRouter(
  projects: Project[],
  title: string,
  apiKey: string,
  model: string,
): Promise<string | null> {
  const projectList = projects
    .map((p) => `- name: ${p.name}${p.description ? `, description: ${p.description}` : ""}`)
    .join("\n");

  const prompt = `あなたはCosenseプロジェクト選択AIです。プロジェクト一覧と記事タイトルから最適なプロジェクトを1つ選びます。

プロジェクト一覧:
${projectList}

記事タイトル: "${title}"

descriptionが空のプロジェクトはnameだけで判断してください。
最適なprojectのnameをJSON {"projectName": "..."} で1つだけ返してください。日本語で考えてください。`;

  const content = await promptOpenRouter(
    "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧とタイトルから最適なprojectを選び、JSONで回答します。",
    prompt,
    apiKey,
    model,
    5000,
  );

  if (!content) {
    return null;
  }

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
