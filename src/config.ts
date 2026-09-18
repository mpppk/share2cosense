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

/**
 * Structured decision model used for AI project selection when Jev is enabled.
 * Jev returns one of the options it is given rather than free-form text, so it
 * can pick a project but cannot write a title. Title generation keeps using the
 * configured OpenRouter model.
 */
export const JEV_MODEL = "typesafe/jev-1.13";

/**
 * Minimum confidence for Jev's pick to replace the current project. Confidence
 * measures how peaked the probability distribution is, not how likely the top
 * option is: a clear 84% winner over two also-rans scores around 0.6, while a
 * distribution spread evenly over several projects approaches 0. Below this the
 * pick is reported but the selection is left alone.
 */
export const JEV_CONFIDENCE_THRESHOLD = 0.5;

/** Presets available from the "モデルを選択" button in settings. */
export const OPENROUTER_MODEL_PRESETS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemini-3.7-flash",
  "openai/gpt-5.6-luna",
  "anthropic/claude-sonnet-5",
  "deepseek/deepseek-v4-flash-0731",
] as const;
