/** Cosense project for page creation. Empty by default for fresh installs. */
export const DEFAULT_PROJECT = "";

/** Default OpenRouter model used for AI project selection and title generation. */
export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";

/**
 * Model used by the "必要に応じて指定モデル以外を利用する" option (off by default).
 * The first use case is fetching the title of a ChatGPT share URL: ChatGPT
 * blocks fetch proxies, but the lowest-effort GPT-5.6 Luna can still browse the
 * page via OpenRouter's web plugin and report just the title.
 */
export const OPENROUTER_FALLBACK_MODEL = "openai/gpt-5.6-luna";

/** Presets available from the "モデルを選択" button in settings. */
export const OPENROUTER_MODEL_PRESETS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemini-3.7-flash",
  "openai/gpt-5.6-luna",
  "anthropic/claude-sonnet-5",
  "deepseek/deepseek-v4-flash-0731",
] as const;
