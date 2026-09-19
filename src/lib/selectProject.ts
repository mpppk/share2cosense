import { selectProjectWithAi } from "./aiSelect";
import type { AiProvider, Project } from "./db";
import { selectProjectWithJev } from "./jevSelect";
import { selectProjectWithOpenRouter } from "./openRouterSelect";

export type ProjectSelection = {
  /** The project to switch to, or null to leave the current one alone. */
  project: string | null;
  /** Why no project came back, when that counts as a failure. */
  error?: string;
  /** Why no project came back, when the run was fine but not decisive. */
  notice?: string;
};

export type SelectProjectOptions = {
  projects: Project[];
  title: string;
  aiProvider: AiProvider;
  openRouterApiKey: string;
  openRouterModel: string;
  /** Route selection through Jev. Only applies to the OpenRouter provider. */
  useJev: boolean;
};

/**
 * Run AI project selection with the configured provider.
 *
 * Jev sits under the OpenRouter provider rather than beside it because it
 * shares the same API key and only covers selection — the configured model is
 * still what writes titles.
 */
export async function selectProjectWithSettings({
  projects,
  title,
  aiProvider,
  openRouterApiKey,
  openRouterModel,
  useJev,
}: SelectProjectOptions): Promise<ProjectSelection> {
  if (aiProvider === "openRouter") {
    if (!useJev) {
      return selectProjectWithOpenRouter(projects, title, openRouterApiKey, openRouterModel);
    }
    const { project, error, lowConfidenceProject, confidence } = await selectProjectWithJev(
      projects,
      title,
      openRouterApiKey,
    );
    if (project) {
      return { project };
    }
    if (lowConfidenceProject) {
      const percent = Math.round((confidence ?? 0) * 100);
      return {
        project: null,
        notice: `確信度が低いため自動選択を見送りました（候補: ${lowConfidenceProject}、確信度 ${percent}%）`,
      };
    }
    return { project: null, error };
  }

  if (aiProvider === "windowAi") {
    return selectProjectWithAi(projects, title);
  }

  return { project: null };
}
