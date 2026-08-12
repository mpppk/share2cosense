/**
 * Check if a page already exists in a public Cosense project.
 * Uses fetch.nibo.sh proxy to bypass CORS for api/pages.
 * Returns true if exists, false if not, null if check skipped or failed.
 */
export async function checkPageExists(
  project: string,
  title: string,
  isPublic: boolean,
): Promise<boolean | null> {
  if (!isPublic) {
    return null;
  }

  const encodedTitle = encodeURIComponent(title);
  const url = `https://fetch.nibo.sh/scrapbox.io/api/pages/${encodeURIComponent(project)}/${encodedTitle}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return null;
    }

    const text = await res.text();
    // Try to parse as JSON
    try {
      const data = JSON.parse(text) as { name?: string; title?: string; id?: string };
      if (data.name === "NotFoundError") {
        return false;
      }
      if (data.name === "NotLoggedInError") {
        // Should not happen for public project, but treat as unknown
        return null;
      }
      if (data.title && data.id) {
        return true;
      }
      // Fallback: if it looks like page data, exists
      if (data.title) {
        return true;
      }
      return null;
    } catch {
      // Not JSON, maybe HTML error page
      return null;
    }
  } catch {
    return null;
  }
}
