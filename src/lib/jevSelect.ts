import { JEV_CONFIDENCE_THRESHOLD, JEV_MODEL } from "../config";
import type { Project } from "./db";
import {
  openRouterErrorMessage,
  openRouterHeaders,
  openRouterThrownMessage,
} from "./openRouterApi";

/**
 * Jev is a structured decision model: it answers typed questions about a state
 * instead of generating text. Its Choice answer is always one of the options we
 * send, so there is no JSON to extract and no reply that fails to parse. It
 * also reports how spread out the probabilities are, which lets us leave the
 * user's project alone when the pick is a coin flip.
 *
 * Decision models are not served by chat completions — that endpoint rejects
 * them — so this goes to OpenRouter's Decisions endpoint instead.
 */
const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const PROJECT_SELECT_TIMEOUT_MS = 15000;

/** The id we file the question under. Answers come back under the same id. */
const QUESTION_ID = "project";

/** A Choice question accepts at most 255 options. */
const MAX_CHOICE_OPTIONS = 255;

type ChoiceAnswer = {
  type?: unknown;
  choice?: unknown;
  confidence?: unknown;
};

type DecisionsResponse = {
  answers?: Record<string, ChoiceAnswer>;
  error?: { message?: string };
};

export type JevSelectResult = {
  /** The pick, or null when there is none or it was below the threshold. */
  project: string | null;
  /** The pick that was rejected for low confidence, if any. */
  lowConfidenceProject?: string;
  /** How peaked the probability distribution was, 0 to 1. */
  confidence?: number;
  error?: string;
};

/**
 * Build the option map Jev chooses between. Each project name is an option and
 * its description is the guidance for that option. A project with no
 * description is sent as null, which tells the model to judge by the name
 * alone — the text models need that spelled out in the prompt instead.
 */
function buildCriteria(projects: Project[]): Record<string, string | null> {
  const criteria: Record<string, string | null> = {};
  for (const p of projects.slice(0, MAX_CHOICE_OPTIONS)) {
    criteria[p.name] = p.description.trim() || null;
  }
  return criteria;
}

/**
 * Ask Jev to pick the best project for the title.
 *
 * Returns a null project with an error reason when the request fails, and a
 * null project with `lowConfidenceProject` set when the model answered but was
 * not sure enough to act on.
 */
export async function selectProjectWithJev(
  projects: Project[],
  title: string,
  apiKey: string,
): Promise<JevSelectResult> {
  if (projects.length === 0) {
    return { project: null };
  }
  if (!apiKey.trim()) {
    return { project: null, error: "APIキーが未設定です" };
  }

  let data: DecisionsResponse;
  try {
    const res = await fetch(DECISIONS_ENDPOINT, {
      method: "POST",
      headers: openRouterHeaders(apiKey),
      body: JSON.stringify({
        model: JEV_MODEL,
        state: { title },
        questions: {
          [QUESTION_ID]: {
            type: "choice",
            instructions: "この記事タイトルを保存するのに最も適したCosenseプロジェクトはどれか",
            criteria: buildCriteria(projects),
          },
        },
      }),
      signal: AbortSignal.timeout(PROJECT_SELECT_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { project: null, error: openRouterErrorMessage(res.status) };
    }
    data = (await res.json()) as DecisionsResponse;
  } catch (e) {
    return { project: null, error: openRouterThrownMessage(e) };
  }

  const answer = data.answers?.[QUESTION_ID];
  const choice = typeof answer?.choice === "string" ? answer.choice : null;
  if (!choice || !projects.some((p) => p.name === choice)) {
    return {
      project: null,
      error: data.error?.message
        ? `AIの応答が空でした(${data.error.message})`
        : "AIの応答が空でした",
    };
  }

  // A missing confidence is treated as confident: the pick is already valid,
  // and refusing to use it would be worse than acting on it.
  const confidence = typeof answer?.confidence === "number" ? answer.confidence : 1;
  if (confidence < JEV_CONFIDENCE_THRESHOLD) {
    return { project: null, lowConfidenceProject: choice, confidence };
  }
  return { project: choice, confidence };
}
