import { OPENROUTER_MODEL_PRESETS } from "../config";

const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const MODELS_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { ids: Set<string>; fetchedAt: number } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

/** Clear the in-memory model ID cache. Intended for tests. */
export function clearOpenRouterModelsCache(): void {
  cache = null;
  inflight = null;
}

/**
 * Whether the given model ID is one of the hardcoded presets. Presets are
 * known-valid, so callers can persist them without a network round-trip.
 */
export function isOpenRouterModelPreset(model: string): boolean {
  return (OPENROUTER_MODEL_PRESETS as readonly string[]).includes(model.trim());
}

async function fetchOpenRouterModelIds(): Promise<Set<string> | null> {
  try {
    const res = await fetch(MODELS_ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ id?: unknown }> };
    const ids = new Set(
      (data.data ?? [])
        .filter((m): m is { id: string } => typeof m?.id === "string" && m.id !== "")
        .map((m) => m.id),
    );
    if (ids.size === 0) {
      return null;
    }
    cache = { ids, fetchedAt: Date.now() };
    return ids;
  } catch {
    return null;
  }
}

/**
 * Fetch OpenRouter's public model list and cache it for the session.
 * Returns null when the list cannot be retrieved (network error, HTTP error,
 * or an unexpected response shape).
 */
export function getOpenRouterModelIds(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cache.ids);
  }
  inflight ??= fetchOpenRouterModelIds().finally(() => {
    inflight = null;
  });
  return inflight;
}

export type OpenRouterModelValidation =
  | { result: "valid"; model: string }
  | { result: "invalid"; message: string }
  | { result: "unavailable"; message: string };

/**
 * Validate a user-entered OpenRouter model ID against the live model list.
 * Empty IDs and network failures are never reported as valid.
 */
export async function validateOpenRouterModel(model: string): Promise<OpenRouterModelValidation> {
  const trimmed = model.trim();
  if (!trimmed) {
    return { result: "invalid", message: "モデルIDを入力してください" };
  }
  if (isOpenRouterModelPreset(trimmed)) {
    return { result: "valid", model: trimmed };
  }
  const ids = await getOpenRouterModelIds();
  if (!ids) {
    return {
      result: "unavailable",
      message:
        "OpenRouterのモデル一覧を取得できず、検証できませんでした。時間をおいてもう一度入力してください。",
    };
  }
  if (!ids.has(trimmed)) {
    return {
      result: "invalid",
      message: `「${trimmed}」はOpenRouterのモデル一覧に見つかりません。保存されていないためIDを確認してください。`,
    };
  }
  return { result: "valid", model: trimmed };
}
