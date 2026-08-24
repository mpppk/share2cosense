import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clearOpenRouterModelsCache,
  getOpenRouterModelIds,
  isOpenRouterModelPreset,
  validateOpenRouterModel,
} from "./openRouterModels";

const MODEL_LIST_BODY = {
  data: [{ id: "vendor/model-a" }, { id: "vendor/model-b:free" }, { id: "" }],
};

function mockFetchOnce(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchError(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    throw new TypeError("network down");
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  clearOpenRouterModelsCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isOpenRouterModelPreset", () => {
  it("matches preset IDs and trims whitespace", () => {
    expect(isOpenRouterModelPreset("google/gemma-4-26b-a4b-it:free")).toBe(true);
    expect(isOpenRouterModelPreset("  openai/gpt-5.6-luna ")).toBe(true);
  });

  it("rejects non-preset IDs", () => {
    expect(isOpenRouterModelPreset("vendor/model-a")).toBe(false);
    expect(isOpenRouterModelPreset("")).toBe(false);
  });
});

describe("getOpenRouterModelIds", () => {
  it("returns the set of model IDs from the API", async () => {
    mockFetchOnce(200, MODEL_LIST_BODY);
    const ids = await getOpenRouterModelIds();
    expect(ids).toEqual(new Set(["vendor/model-a", "vendor/model-b:free"]));
  });

  it("caches the list within the TTL", async () => {
    const fn = mockFetchOnce(200, MODEL_LIST_BODY);
    await getOpenRouterModelIds();
    await getOpenRouterModelIds();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns null on HTTP error", async () => {
    mockFetchOnce(500, {});
    expect(await getOpenRouterModelIds()).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetchError();
    expect(await getOpenRouterModelIds()).toBeNull();
  });

  it("refetches after a failed attempt", async () => {
    const err = mockFetchError();
    expect(await getOpenRouterModelIds()).toBeNull();
    mockFetchOnce(200, MODEL_LIST_BODY);
    const ids = await getOpenRouterModelIds();
    expect(ids).not.toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe("validateOpenRouterModel", () => {
  it("accepts an ID present in the live model list", async () => {
    mockFetchOnce(200, MODEL_LIST_BODY);
    const v = await validateOpenRouterModel("vendor/model-a");
    expect(v).toEqual({ result: "valid", model: "vendor/model-a" });
  });

  it("trims whitespace before validating", async () => {
    mockFetchOnce(200, MODEL_LIST_BODY);
    const v = await validateOpenRouterModel(" vendor/model-b:free ");
    expect(v).toEqual({ result: "valid", model: "vendor/model-b:free" });
  });

  it("rejects an unknown ID without saving", async () => {
    mockFetchOnce(200, MODEL_LIST_BODY);
    const v = await validateOpenRouterModel("vendor/nonexistent");
    expect(v.result).toBe("invalid");
  });

  it("rejects an empty ID without calling fetch", async () => {
    const fn = mockFetchOnce(200, MODEL_LIST_BODY);
    const v = await validateOpenRouterModel("   ");
    expect(v.result).toBe("invalid");
    expect(fn).not.toHaveBeenCalled();
  });

  it("accepts presets without calling fetch", async () => {
    const fn = mockFetchOnce(200, MODEL_LIST_BODY);
    const v = await validateOpenRouterModel("anthropic/claude-sonnet-5");
    expect(v).toEqual({ result: "valid", model: "anthropic/claude-sonnet-5" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("reports unavailable when the model list cannot be fetched", async () => {
    mockFetchError();
    const v = await validateOpenRouterModel("vendor/model-a");
    expect(v.result).toBe("unavailable");
  });

  it("reports unavailable on HTTP error", async () => {
    mockFetchOnce(503, {});
    const v = await validateOpenRouterModel("vendor/model-a");
    expect(v.result).toBe("unavailable");
  });
});
