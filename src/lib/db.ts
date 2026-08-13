import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export type Project = {
  name: string;
  description: string;
  isPublic: boolean;
};

type SettingsRecord = {
  key: string;
  value: string;
};

interface Share2CosenseDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}

const DB_NAME = "share2cosense";
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<Share2CosenseDB>> | null = null;

function getDB(): Promise<IDBPDatabase<Share2CosenseDB>> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = openDB<Share2CosenseDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    },
  });
  return dbPromise;
}

export async function getProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAll("projects");
  if (projects.length === 0) {
    const defaultProject: Project = {
      name: "niboshi-private",
      description: "",
      isPublic: false,
    };
    await db.put("projects", defaultProject);
    await db.put("settings", { key: "defaultProject", value: defaultProject.name });
    return [defaultProject];
  }
  return projects;
}

export async function addProject(project: Project): Promise<void> {
  const db = await getDB();
  const existing = await db.get("projects", project.name);
  if (existing) {
    throw new Error("同名のプロジェクトが既に存在します");
  }
  await db.put("projects", project);
}

export async function updateProject(oldName: string, project: Project): Promise<void> {
  const db = await getDB();
  const isDefault = (await getDefaultProject()) === oldName;
  if (oldName !== project.name) {
    const existing = await db.get("projects", project.name);
    if (existing) {
      throw new Error("同名のプロジェクトが既に存在します");
    }
    await db.delete("projects", oldName);
  }
  await db.put("projects", project);
  if (isDefault && oldName !== project.name) {
    await setDefaultProject(project.name);
  }
}

export async function deleteProject(name: string): Promise<void> {
  const db = await getDB();
  const projects = await db.getAll("projects");
  if (projects.length <= 1) {
    throw new Error("最後のプロジェクトは削除できません");
  }
  await db.delete("projects", name);
  const defaultProject = await getDefaultProject();
  if (defaultProject === name) {
    const remaining = await db.getAll("projects");
    if (remaining.length > 0) {
      await setDefaultProject(remaining[0].name);
    }
  }
}

export async function getDefaultProject(): Promise<string | null> {
  const db = await getDB();
  const record = await db.get("settings", "defaultProject");
  if (record) {
    return record.value;
  }
  const projects = await db.getAll("projects");
  if (projects.length > 0) {
    return projects[0].name;
  }
  return null;
}

export async function setDefaultProject(name: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("projects", name);
  if (!existing) {
    throw new Error("存在しないプロジェクトをデフォルトにできません");
  }
  await db.put("settings", { key: "defaultProject", value: name });
}

export type AiProvider = "none" | "windowAi" | "deepSeek";

function isValidAiProvider(value: string): value is AiProvider {
  return value === "none" || value === "windowAi" || value === "deepSeek";
}

export async function getAiProvider(): Promise<AiProvider> {
  const db = await getDB();
  const record = await db.get("settings", "aiProvider");
  if (record && isValidAiProvider(record.value)) {
    return record.value;
  }
  const openRouterRecord = await db.get("settings", "openRouterEnabled");
  if (openRouterRecord?.value === "true") {
    return "deepSeek";
  }
  const aiRecord = await db.get("settings", "aiAutoSelectEnabled");
  if (aiRecord) {
    return aiRecord.value === "true" ? "windowAi" : "none";
  }
  return "windowAi";
}

export async function setAiProvider(provider: AiProvider): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "aiProvider", value: provider });
  if (provider === "deepSeek") {
    await db.put("settings", { key: "openRouterEnabled", value: "true" });
    await db.put("settings", { key: "aiAutoSelectEnabled", value: "false" });
  } else if (provider === "windowAi") {
    await db.put("settings", { key: "openRouterEnabled", value: "false" });
    await db.put("settings", { key: "aiAutoSelectEnabled", value: "true" });
  } else {
    await db.put("settings", { key: "openRouterEnabled", value: "false" });
    await db.put("settings", { key: "aiAutoSelectEnabled", value: "false" });
  }
}

export async function getAiAutoSelectEnabled(): Promise<boolean> {
  const db = await getDB();
  const record = await db.get("settings", "aiAutoSelectEnabled");
  if (!record) {
    return true;
  }
  return record.value === "true";
}

export async function setAiAutoSelectEnabled(enabled: boolean): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "aiAutoSelectEnabled", value: String(enabled) });
}

export async function getOpenRouterEnabled(): Promise<boolean> {
  const db = await getDB();
  const record = await db.get("settings", "openRouterEnabled");
  if (!record) {
    return false;
  }
  return record.value === "true";
}

export async function setOpenRouterEnabled(enabled: boolean): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "openRouterEnabled", value: String(enabled) });
}

export async function getOpenRouterApiKey(): Promise<string> {
  const db = await getDB();
  const record = await db.get("settings", "openRouterApiKey");
  return record?.value ?? "";
}

export async function setOpenRouterApiKey(apiKey: string): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "openRouterApiKey", value: apiKey });
}

export async function getOpenRouterModel(): Promise<string> {
  const db = await getDB();
  const record = await db.get("settings", "openRouterModel");
  return record?.value ?? "deepseek/deepseek-chat";
}

export async function setOpenRouterModel(model: string): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "openRouterModel", value: model });
}

export async function getTitlePrefix(): Promise<string> {
  const db = await getDB();
  const record = await db.get("settings", "titlePrefix");
  return record?.value ?? "";
}

export async function setTitlePrefix(prefix: string): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "titlePrefix", value: prefix });
}

export async function getBodyTemplate(): Promise<string> {
  const db = await getDB();
  const record = await db.get("settings", "bodyTemplate");
  return record?.value ?? "{{url}}";
}

export async function setBodyTemplate(template: string): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: "bodyTemplate", value: template });
}
