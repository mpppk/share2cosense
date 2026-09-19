/**
 * Pieces shared by every OpenRouter transport. The chat completions endpoint
 * and the Decisions endpoint take the same auth and attribution headers and
 * report the same failures, so both build their requests from here.
 */

/** Headers every OpenRouter request sends, including auth and app attribution. */
export function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "app://share2cosense",
    "X-Title": "share2cosense",
  };
}

/** Human-readable reason for a non-OK OpenRouter response. */
export function openRouterErrorMessage(status: number): string {
  if (status === 401) {
    return "APIキーが無効です";
  }
  if (status === 402) {
    return "クレジットが不足しています";
  }
  if (status === 429) {
    return "レート制限中です";
  }
  return `APIエラー(HTTP ${status})`;
}

/** Human-readable reason for a thrown fetch failure. */
export function openRouterThrownMessage(e: unknown): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "タイムアウトしました";
  }
  return "ネットワークエラー";
}
