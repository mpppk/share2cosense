import { describe, expect, it } from "vite-plus/test";
import { requestStoragePersistence, type PersistenceManager } from "./storagePersistence";

type Calls = { persisted: number; persist: number };

function manager(
  answers: { persisted: boolean | Error; persist?: boolean | Error },
  calls: Calls = { persisted: 0, persist: 0 },
): PersistenceManager & { calls: Calls } {
  return {
    calls,
    persisted: async () => {
      calls.persisted++;
      if (answers.persisted instanceof Error) {
        throw answers.persisted;
      }
      return answers.persisted;
    },
    persist: async () => {
      calls.persist++;
      const answer = answers.persist ?? false;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
}

describe("requestStoragePersistence", () => {
  it("reports an already persisted origin without asking again", async () => {
    const m = manager({ persisted: true });
    expect(await requestStoragePersistence(m)).toBe("persisted");
    expect(m.calls.persist).toBe(0);
  });

  it("asks for persistence when the origin is best-effort", async () => {
    const m = manager({ persisted: false, persist: true });
    expect(await requestStoragePersistence(m)).toBe("persisted");
    expect(m.calls.persist).toBe(1);
  });

  it("stays best-effort when the browser refuses", async () => {
    const m = manager({ persisted: false, persist: false });
    expect(await requestStoragePersistence(m)).toBe("bestEffort");
  });

  it("reports unsupported without a StorageManager", async () => {
    expect(await requestStoragePersistence(null)).toBe("unsupported");
  });

  it("reports unsupported when the browser throws instead of answering", async () => {
    expect(await requestStoragePersistence(manager({ persisted: new Error("denied") }))).toBe(
      "unsupported",
    );
    expect(
      await requestStoragePersistence(manager({ persisted: false, persist: new Error("denied") })),
    ).toBe("unsupported");
  });
});
