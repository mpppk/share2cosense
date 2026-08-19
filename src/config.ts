/** Cosense project for page creation. Empty by default for fresh installs. */
export const DEFAULT_PROJECT = "";

/** Default OpenRouter model used for AI project selection and title generation. */
export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";

/** Presets available from the "モデルを選択" button in settings. */
export const OPENROUTER_MODEL_PRESETS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemini-3.7-flash",
  "openai/gpt-5.6-luna",
  "anthropic/claude-sonnet-5",
  "deepseek/deepseek-v4-flash-0731",
] as const;
