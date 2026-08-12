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
  if (oldName !== project.name) {
    const existing = await db.get("projects", project.name);
    if (existing) {
      throw new Error("同名のプロジェクトが既に存在します");
    }
    await db.delete("projects", oldName);
    const defaultProject = await getDefaultProject();
    if (defaultProject === oldName) {
      await setDefaultProject(project.name);
    }
  }
  await db.put("projects", project);
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
