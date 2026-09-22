/**
 * Ask the browser to keep this origin's storage instead of treating it as
 * disposable cache.
 *
 * Projects and every setting live only in IndexedDB (see db.ts), which lands in
 * the best-effort bucket by default: Chrome can evict the whole origin when the
 * device runs low on space, and Safari drops script-writable storage after a
 * week without a visit. A granted persist() moves the origin to the persistent
 * bucket, which only the user clears.
 *
 * Chrome grants it without a prompt for an installed PWA (or enough site
 * engagement) while Firefox asks the user, so the request is made once at
 * startup and its answer is only reported — nothing here blocks the app.
 */

export type StoragePersistence =
  /** Persistent bucket: the data stays until the user clears it. */
  | "persisted"
  /** Best-effort bucket: the browser may evict the data at any time. */
  | "bestEffort"
  /** No usable StorageManager, so there is nothing to ask. */
  | "unsupported";

export type PersistenceManager = {
  persist: () => Promise<boolean>;
  persisted: () => Promise<boolean>;
};

/**
 * navigator.storage, or null where it (or one of the two methods) is missing.
 * Typed loosely on purpose: lib.dom declares both methods as always present,
 * which is exactly the assumption this detection exists to avoid.
 */
export function currentPersistenceManager(): PersistenceManager | null {
  const nav: unknown = typeof navigator === "undefined" ? undefined : navigator;
  const storage = (nav as { storage?: Partial<PersistenceManager> } | undefined)?.storage;
  if (!storage) {
    return null;
  }
  const { persist, persisted } = storage;
  if (typeof persist !== "function" || typeof persisted !== "function") {
    return null;
  }
  return {
    persist: () => persist.call(storage),
    persisted: () => persisted.call(storage),
  };
}

/**
 * Request persistent storage, reporting where the origin ended up.
 *
 * Safe to call repeatedly: an origin that is already persisted is reported as
 * such without asking again, so a retry from the settings screen never
 * re-prompts a browser that has already granted it.
 */
export async function requestStoragePersistence(
  manager: PersistenceManager | null = currentPersistenceManager(),
): Promise<StoragePersistence> {
  if (!manager) {
    return "unsupported";
  }
  try {
    if (await manager.persisted()) {
      return "persisted";
    }
    return (await manager.persist()) ? "persisted" : "bestEffort";
  } catch {
    // Private windows and locked-down storage settings throw instead of
    // answering. Nothing is persisted either way, and the app still works.
    return "unsupported";
  }
}
