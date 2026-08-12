import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PROJECT } from "./config";
import { buildCosenseUrl, extractSharedUrl } from "./lib/cosense";
import {
  addProject,
  deleteProject,
  getAiAutoSelectEnabled,
  getDefaultProject,
  getProjects,
  setAiAutoSelectEnabled,
  setDefaultProject,
  updateProject,
  type Project,
} from "./lib/db";
import { selectProjectWithAi } from "./lib/aiSelect";
import { fetchTitle } from "./lib/fetchTitle";
import "./App.css";

type View = "generate" | "usage" | "settings";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function App() {
  const [view, setView] = useState<View>("generate");
  const [inputUrl, setInputUrl] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [cosenseUrl, setCosenseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const initialSharedRef = useRef<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [defaultProject, setDefaultProjectState] = useState<string>(DEFAULT_PROJECT);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", isPublic: false });
  const [editingName, setEditingName] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [aiAutoSelectEnabled, setAiAutoSelectEnabledState] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const [all, def, aiEnabled] = await Promise.all([
        getProjects(),
        getDefaultProject(),
        getAiAutoSelectEnabled(),
      ]);
      setProjects(all);
      if (def) {
        setDefaultProjectState(def);
      }
      setAiAutoSelectEnabledState(aiEnabled);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const generate = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed || !isValidHttpUrl(trimmed)) {
        return;
      }

      setLoading(true);
      setError(null);
      setCopied(false);
      try {
        const fetchedTitle = await fetchTitle(trimmed);
        let project = defaultProject || DEFAULT_PROJECT;
        if (aiAutoSelectEnabled) {
          const aiProject = await selectProjectWithAi(projects, fetchedTitle);
          if (aiProject) {
            project = aiProject;
          }
        }
        const url = buildCosenseUrl(project, fetchedTitle, trimmed);
        setTitle(fetchedTitle);
        setCosenseUrl(url);
        setSelectedProject(project);
      } catch (e) {
        setError(e instanceof Error ? e.message : "タイトルの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [defaultProject, aiAutoSelectEnabled, projects],
  );

  useEffect(() => {
    if (window.location.hash === "#usage") {
      setView("usage");
    } else if (window.location.hash === "#settings") {
      setView("settings");
    }
    const shared = extractSharedUrl(window.location.search);
    if (shared) {
      initialSharedRef.current = shared;
      setInputUrl(shared);
      setView("generate");
    }
  }, []);

  useEffect(() => {
    const trimmed = inputUrl.trim();

    if (!trimmed) {
      setTitle(null);
      setCosenseUrl(null);
      setSelectedProject(null);
      setError(null);
      setCopied(false);
      const url = new URL(window.location.href);
      const hadUrl = url.searchParams.has("url");
      if (hadUrl) {
        url.searchParams.delete("url");
        url.searchParams.delete("text");
        url.searchParams.delete("title");
        window.history.replaceState(null, "", url.pathname + url.search + window.location.hash);
      }
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      setTitle(null);
      setCosenseUrl(null);
      setSelectedProject(null);
      const handler = setTimeout(() => {
        setError("http:// または https:// で始まるURLを入力してください");
      }, 400);
      return () => clearTimeout(handler);
    }

    setError(null);
    const handler = setTimeout(() => {
      const newUrl = new URL(window.location.href);
      if (newUrl.searchParams.get("url") !== trimmed) {
        newUrl.searchParams.set("url", trimmed);
        newUrl.searchParams.delete("text");
        newUrl.searchParams.delete("title");
        window.history.replaceState(null, "", newUrl.pathname + newUrl.search + newUrl.hash);
      }
      void generate(trimmed);
    }, 300);

    return () => clearTimeout(handler);
  }, [inputUrl, generate]);

  const handleViewChange = (next: View) => {
    setView(next);
    if (next === "usage") {
      window.location.hash = "#usage";
    } else if (next === "settings") {
      window.location.hash = "#settings";
    } else {
      window.location.hash = "";
    }
    if (next === "settings") {
      void loadProjects();
    }
  };

  const handleCopy = async () => {
    if (!cosenseUrl) return;
    try {
      await navigator.clipboard.writeText(cosenseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("クリップボードへのコピーに失敗しました");
    }
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProjectError(null);
    const name = projectForm.name.trim();
    const description = projectForm.description.trim();
    if (!name) {
      setProjectError("プロジェクト名は必須です");
      return;
    }
    if (description.length > 100) {
      setProjectError("説明は100文字以内で入力してください");
      return;
    }
    const project: Project = { name, description, isPublic: projectForm.isPublic };
    try {
      if (editingName) {
        await updateProject(editingName, project);
      } else {
        await addProject(project);
      }
      setProjectForm({ name: "", description: "", isPublic: false });
      setEditingName(null);
      await loadProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const handleEdit = (project: Project) => {
    setProjectForm({
      name: project.name,
      description: project.description,
      isPublic: project.isPublic,
    });
    setEditingName(project.name);
    setProjectError(null);
  };

  const handleCancelEdit = () => {
    setProjectForm({ name: "", description: "", isPublic: false });
    setEditingName(null);
    setProjectError(null);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`プロジェクト "${name}" を削除しますか？`)) {
      return;
    }
    try {
      await deleteProject(name);
      await loadProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const handleSetDefault = async (name: string) => {
    try {
      await setDefaultProject(name);
      setDefaultProjectState(name);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "デフォルト設定に失敗しました");
    }
  };

  const handleAiToggle = async (enabled: boolean) => {
    try {
      await setAiAutoSelectEnabled(enabled);
      setAiAutoSelectEnabledState(enabled);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  return (
    <div className="share-root">
      <main className="share-container">
        {view === "generate" ? (
          <>
            <div className="share-form">
              <label htmlFor="url-input" className="share-label">
                共有元URL
              </label>
              <div className="share-input-row">
                <input
                  id="url-input"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/article"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="share-input"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {projectsLoading ? (
                <p className="share-loading">プロジェクトを読み込み中...</p>
              ) : (
                <p className="share-project-select">
                  作成先: <code>{defaultProject}</code>（
                  {projects.find((p) => p.name === defaultProject)?.isPublic ? "public" : "private"}
                  )
                </p>
              )}
              {loading && <p className="share-loading">タイトルを取得中...</p>}
              {error && (
                <p className="share-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            {cosenseUrl && title && (
              <section className="share-result" aria-live="polite">
                <a
                  href={cosenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="share-button primary large"
                >
                  Open in {selectedProject || defaultProject}
                </a>
                <details className="share-details">
                  <summary>詳細を表示</summary>
                  <dl className="share-result-list">
                    <div>
                      <dt>抽出タイトル</dt>
                      <dd className="share-title">{title}</dd>
                    </div>
                    <div>
                      <dt>Cosenseリンク</dt>
                      <dd>
                        <a
                          href={cosenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="share-link"
                        >
                          {cosenseUrl}
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <div className="share-actions">
                    <button type="button" onClick={handleCopy} className="share-button secondary">
                      {copied ? "コピーしました" : "リンクをコピー"}
                    </button>
                  </div>
                  <p className="share-hint">
                    リンクを開くとCosenseで <code>{title}</code>{" "}
                    ページが作成され、本文に共有元URLが自動挿入されます。既存ページの場合はそのページが開きます。
                  </p>
                </details>
              </section>
            )}

            <footer className="share-footer">
              <button
                type="button"
                className="share-footer-link"
                onClick={() => handleViewChange("settings")}
              >
                プロジェクト設定
              </button>
              <span className="share-footer-separator">·</span>
              <button
                type="button"
                className="share-footer-link"
                onClick={() => handleViewChange("usage")}
              >
                使い方を見る
              </button>
            </footer>
          </>
        ) : view === "usage" ? (
          <>
            <section className="share-usage">
              <h2>使い方</h2>
              <p className="share-usage-description">
                Web Share Targetで共有されたURLのタイトルを <code>fetch.nibo.sh?as=title</code>{" "}
                で取得し、Cosenseページ作成リンクを生成するPWAです。
                <br />
                生成されたリンクを開くと{" "}
                <code>
                  https://scrapbox.io/{defaultProject}/&lt;title&gt;?body=&lt;url&gt;
                </code>{" "}
                で新規ページが作成されます。
              </p>
              <p className="share-project">
                作成先プロジェクト: <code>{defaultProject}</code>
                （現在は固定、将来選択式に対応予定）
              </p>
              <ol className="share-usage-steps">
                <li>
                  スマホの「共有」から share2cosense を選択（PWAをインストールすると共有先に表示）
                </li>
                <li>または「リンク生成」画面の入力欄にURLを貼り付けて「リンク生成」</li>
                <li>生成されたリンクをコピーまたは「Cosenseで開く」でページ作成</li>
              </ol>
              <details>
                <summary>Share Targetの仕様（GET）</summary>
                <p>
                  <code>?url=&lt;url&gt;&amp;text=&lt;text&gt;&amp;title=&lt;title&gt;</code>{" "}
                  で共有を受け取ります。 優先順位は <code>url</code> ＞ <code>text</code> 内URL ＞{" "}
                  <code>title</code> です。PWAの <code>manifest share_target</code> は{" "}
                  <code>action: &quot;/&quot; method: GET</code> で設定済みです。
                </p>
              </details>
              <details>
                <summary>タイトル取得の仕様</summary>
                <p>
                  <code>https://fetch.nibo.sh/&lt;host&gt;&lt;path&gt;?as=title</code>{" "}
                  で取得します。失敗時は共有元URL自体をタイトルとして使用します。
                </p>
              </details>
            </section>
            <footer className="share-footer">
              <button
                type="button"
                className="share-footer-link"
                onClick={() => handleViewChange("generate")}
              >
                リンク生成に戻る
              </button>
            </footer>
          </>
        ) : (
          <>
            <section className="share-settings">
              <h2>プロジェクト設定</h2>
              <p className="share-settings-description">
                作成先プロジェクトを追加・編集・削除できます。説明は100文字以内、publicフラグは存在チェックに使用されます。
              </p>

              <form className="share-project-form" onSubmit={handleProjectSubmit}>
                <div className="share-project-field">
                  <label htmlFor="project-name">プロジェクト名 *</label>
                  <input
                    id="project-name"
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="niboshi-private"
                    className="share-input"
                    required
                  />
                </div>
                <div className="share-project-field">
                  <label htmlFor="project-description">説明（任意, 100文字以内）</label>
                  <input
                    id="project-description"
                    type="text"
                    value={projectForm.description}
                    onChange={(e) =>
                      setProjectForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="例: 個人用のプライベートプロジェクト"
                    className="share-input"
                    maxLength={100}
                  />
                  <span className="share-project-counter">
                    {projectForm.description.length}/100
                  </span>
                </div>
                <label className="share-project-checkbox">
                  <input
                    type="checkbox"
                    checked={projectForm.isPublic}
                    onChange={(e) =>
                      setProjectForm((prev) => ({ ...prev, isPublic: e.target.checked }))
                    }
                  />
                  publicプロジェクト
                </label>
                {projectError && (
                  <p className="share-error" role="alert">
                    {projectError}
                  </p>
                )}
                <div className="share-project-actions">
                  <button type="submit" className="share-button">
                    {editingName ? "更新" : "追加"}
                  </button>
                  {editingName && (
                    <button
                      type="button"
                      className="share-button secondary"
                      onClick={handleCancelEdit}
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </form>

              <div className="share-ai-settings">
                <h3>AIによる自動選択</h3>
                <label className="share-project-checkbox">
                  <input
                    type="checkbox"
                    checked={aiAutoSelectEnabled}
                    onChange={(e) => void handleAiToggle(e.target.checked)}
                  />
                  有効にする（window.ai / Gemini Nanoが利用可能な場合）
                </label>
                <p className="share-settings-description" style={{ marginTop: "8px" }}>
                  有効の場合、プロジェクトの説明と記事タイトルからAIが適切なプロジェクトを自動選択します。無効またはAIが利用できない場合はデフォルトプロジェクトが使用されます。
                </p>
              </div>

              <div className="share-project-list">
                <h3>登録済みプロジェクト</h3>
                {projectsLoading ? (
                  <p className="share-loading">読み込み中...</p>
                ) : projects.length === 0 ? (
                  <p>プロジェクトがありません</p>
                ) : (
                  <ul>
                    {projects.map((project) => (
                      <li
                        key={project.name}
                        className={`share-project-item ${defaultProject === project.name ? "is-default" : ""}`}
                      >
                        <div className="share-project-info">
                          <strong>{project.name}</strong>
                          <span
                            className={`share-project-badge ${project.isPublic ? "public" : "private"}`}
                          >
                            {project.isPublic ? "public" : "private"}
                          </span>
                          {defaultProject === project.name && (
                            <span className="share-project-default">デフォルト</span>
                          )}
                          {project.description && (
                            <p className="share-project-desc">{project.description}</p>
                          )}
                        </div>
                        <div className="share-project-item-actions">
                          <label className="share-project-default-radio">
                            <input
                              type="radio"
                              name="defaultProject"
                              checked={defaultProject === project.name}
                              onChange={() => void handleSetDefault(project.name)}
                            />
                            デフォルト
                          </label>
                          <button
                            type="button"
                            className="share-button secondary small"
                            onClick={() => handleEdit(project)}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="share-button secondary small"
                            onClick={() => void handleDelete(project.name)}
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <footer className="share-footer">
              <button
                type="button"
                className="share-footer-link"
                onClick={() => handleViewChange("generate")}
              >
                リンク生成に戻る
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
