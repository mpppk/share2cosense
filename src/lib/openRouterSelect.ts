import type { Project } from "./db";

export async function selectProjectWithOpenRouter(
  projects: Project[],
  title: string,
  apiKey: string,
  model: string,
): Promise<string | null> {
  if (!apiKey.trim() || !model.trim()) {
    return null;
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
          {
            role: "system",
            content:
              "あなたはCosenseプロジェクト選択AIです。与えられたプロジェクト一覧とタイトルから最適なprojectを選び、JSONで回答します。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

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
