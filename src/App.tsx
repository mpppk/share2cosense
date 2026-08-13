import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PROJECT } from "./config";
import { buildCosenseUrl, extractSharedUrl } from "./lib/cosense";
import {
  addProject,
  deleteProject,
  getAiProvider,
  getBodyTemplate,
  getDefaultProject,
  getOpenRouterApiKey,
  getOpenRouterModel,
  getProjects,
  getTitlePrefix,
  setAiProvider,
  setBodyTemplate,
  setDefaultProject,
  setOpenRouterApiKey,
  setOpenRouterModel,
  setTitlePrefix,
  updateProject,
  type AiProvider,
  type Project,
} from "./lib/db";
import { isWindowAiAvailable, selectProjectWithAi } from "./lib/aiSelect";
import { checkPageExists } from "./lib/existsCheck";
import { selectProjectWithOpenRouter } from "./lib/openRouterSelect";
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
  const [aiProvider, setAiProviderState] = useState<AiProvider>("windowAi");
  const [windowAiAvailable, setWindowAiAvailable] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [openRouterApiKey, setOpenRouterApiKeyState] = useState("");
  const [openRouterModel, setOpenRouterModelState] = useState("deepseek/deepseek-chat");
  const [titlePrefix, setTitlePrefixState] = useState("");
  const [bodyTemplate, setBodyTemplateState] = useState("{{url}}");
  const [pageExists, setPageExists] = useState<boolean | null>(null);
  const [checkingExists, setCheckingExists] = useState(false);
  const [generatedBody, setGeneratedBody] = useState<string | null>(null);
  const [aiSuggestedProject, setAiSuggestedProject] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const [all, def, provider, orKey, orModel, prefix, bodyTpl] = await Promise.all([
        getProjects(),
        getDefaultProject(),
        getAiProvider(),
        getOpenRouterApiKey(),
        getOpenRouterModel(),
        getTitlePrefix(),
        getBodyTemplate(),
      ]);
      setProjects(all);
      if (def) {
        setDefaultProjectState(def);
      }
      setAiProviderState(provider);
      setWindowAiAvailable(isWindowAiAvailable());
      setOpenRouterApiKeyState(orKey);
      setOpenRouterModelState(orModel);
      setTitlePrefixState(prefix);
      setBodyTemplateState(bodyTpl);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setWindowAiAvailable(isWindowAiAvailable());
  }, []);

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
        const rawTitle = await fetchTitle(trimmed);
        const finalTitle = `${titlePrefix}${rawTitle}`;
        let project = defaultProject || DEFAULT_PROJECT;
        let aiResult: string | null = null;
        if (aiProvider === "deepSeek" && openRouterApiKey.trim()) {
          const orProject = await selectProjectWithOpenRouter(
            projects,
            rawTitle,
            openRouterApiKey,
            openRouterModel,
          );
          if (orProject) {
            project = orProject;
            aiResult = orProject;
          }
        } else if (aiProvider === "windowAi") {
          const aiProject = await selectProjectWithAi(projects, rawTitle);
          if (aiProject) {
            project = aiProject;
            aiResult = aiProject;
          }
        }
        let body = bodyTemplate.replaceAll("{{url}}", trimmed).replaceAll("{{title}}", rawTitle);
        body = body.replaceAll("{{date}}", new Date().toISOString().slice(0, 10));
        if (!body.trim()) {
          body = trimmed;
        }
        const selectedProjectData = projects.find((p) => p.name === project);
        let exists: boolean | null = null;
        if (selectedProjectData?.isPublic) {
          setCheckingExists(true);
          try {
            exists = await checkPageExists(project, finalTitle, true);
          } finally {
            setCheckingExists(false);
          }
        }
        setPageExists(exists);
        const url = buildCosenseUrl(project, finalTitle, body);
        setTitle(finalTitle);
        setCosenseUrl(url);
        setSelectedProject(project);
        setGeneratedBody(body);
        setAiSuggestedProject(aiResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : "タイトルの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [
      defaultProject,
      aiProvider,
      projects,
      openRouterApiKey,
      openRouterModel,
      titlePrefix,
      bodyTemplate,
    ],
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
      setGeneratedBody(null);
      setAiSuggestedProject(null);
      setPageExists(null);
      setCheckingExists(false);
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
      setGeneratedBody(null);
      setAiSuggestedProject(null);
      setPageExists(null);
      setCheckingExists(false);
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

  const handleAiProviderChange = async (provider: AiProvider) => {
    try {
      await setAiProvider(provider);
      setAiProviderState(provider);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  const handleOpenRouterApiKeyChange = async (key: string) => {
    setOpenRouterApiKeyState(key);
    try {
      await setOpenRouterApiKey(key);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  const handleOpenRouterModelChange = async (model: string) => {
    setOpenRouterModelState(model);
    try {
      await setOpenRouterModel(model);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  const handleTitlePrefixChange = async (prefix: string) => {
    setTitlePrefixState(prefix);
    try {
      await setTitlePrefix(prefix);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  const handleBodyTemplateChange = async (template: string) => {
    setBodyTemplateState(template);
    try {
      await setBodyTemplate(template);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "設定の保存に失敗しました");
    }
  };

  const handleProjectChange = useCallback(
    async (newProject: string) => {
      setSelectedProject(newProject);
      setCopied(false);
      if (title && generatedBody) {
        const newUrl = buildCosenseUrl(newProject, title, generatedBody);
        setCosenseUrl(newUrl);
        const projData = projects.find((p) => p.name === newProject);
        if (projData?.isPublic) {
          setCheckingExists(true);
          try {
            const exists = await checkPageExists(newProject, title, true);
            setPageExists(exists);
          } finally {
            setCheckingExists(false);
          }
        } else {
          setPageExists(null);
        }
      }
    },
    [title, generatedBody, projects],
  );

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
                <div className="share-project-field">
                  <label htmlFor="project-select" className="share-label">
                    作成先プロジェクト
                  </label>
                  <select
                    id="project-select"
                    value={selectedProject ?? defaultProject}
                    onChange={(e) => void handleProjectChange(e.target.value)}
                    className="share-input share-select"
                  >
                    {projects.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.isPublic ? "public" : "private"})
                        {p.name === defaultProject ? " - デフォルト" : ""}
                        {aiSuggestedProject === p.name ? " - AI提案" : ""}
                      </option>
                    ))}
                  </select>
                  {aiSuggestedProject &&
                    selectedProject &&
                    aiSuggestedProject !== selectedProject && (
                      <p className="share-project-select">
                        AIの提案: <code>{aiSuggestedProject}</code> から手動で変更しました
                      </p>
                    )}
                  {!aiSuggestedProject &&
                    selectedProject &&
                    selectedProject !== defaultProject &&
                    cosenseUrl && (
                      <p className="share-project-select">
                        デフォルト <code>{defaultProject}</code> から手動で変更しました
                      </p>
                    )}
                </div>
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
                {checkingExists && <p className="share-loading">存在チェック中...</p>}
                {pageExists && (
                  <p className="share-warning" role="alert">
                    ⚠️
                    このタイトルのページは既に存在します。リンクを開くと既存ページに追記されます。
                  </p>
                )}
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
                （AIが自動選択、セレクトボックスで手動変更可能）
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
                <div className="share-project-field">
                  <label htmlFor="ai-provider">プロジェクト自動選択</label>
                  <select
                    id="ai-provider"
                    value={aiProvider === "windowAi" && !windowAiAvailable ? "none" : aiProvider}
                    onChange={(e) => void handleAiProviderChange(e.target.value as AiProvider)}
                    className="share-input share-select"
                  >
                    <option value="none">自動選択しない</option>
                    {windowAiAvailable && <option value="windowAi">window.ai</option>}
                    <option value="deepSeek">DeepSeek</option>
                  </select>
                  {!windowAiAvailable && (
                    <p className="share-error" style={{ marginTop: "8px" }} role="alert">
                      window.aiはこの環境で利用できません
                    </p>
                  )}
                  <p className="share-settings-description" style={{ marginTop: "8px" }}>
                    プロジェクトの説明と記事タイトルからAIが適切なプロジェクトを自動選択します。AIで選択できなかった場合はデフォルトプロジェクトが使用されます。
                  </p>
                </div>
                {aiProvider === "deepSeek" && (
                  <>
                    <div className="share-project-field">
                      <label htmlFor="openrouter-key">APIキー</label>
                      <input
                        id="openrouter-key"
                        type="password"
                        value={openRouterApiKey}
                        onChange={(e) => void handleOpenRouterApiKeyChange(e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="share-input"
                      />
                    </div>
                    <div className="share-project-field">
                      <label htmlFor="openrouter-model">モデル</label>
                      <input
                        id="openrouter-model"
                        type="text"
                        value={openRouterModel}
                        onChange={(e) => void handleOpenRouterModelChange(e.target.value)}
                        placeholder="deepseek/deepseek-chat"
                        className="share-input"
                      />
                    </div>
                    <p className="share-settings-description" style={{ marginTop: "8px" }}>
                      OpenRouter経由で DeepSeek
                      等のモデルで自動選択します。APIキーはIndexedDBに保存されます。
                    </p>
                  </>
                )}
              </div>

              <div className="share-ai-settings">
                <h3>タイトルと本文のカスタマイズ</h3>
                <div className="share-project-field">
                  <label htmlFor="title-prefix">タイトル接頭辞（任意）</label>
                  <input
                    id="title-prefix"
                    type="text"
                    value={titlePrefix}
                    onChange={(e) => void handleTitlePrefixChange(e.target.value)}
                    placeholder="例: [WebClip] "
                    className="share-input"
                  />
                </div>
                <div className="share-project-field">
                  <label htmlFor="body-template">
                    本文テンプレート（{"{{url}}"}, {"{{title}}"}, {"{{date}}"} が使用可能）
                  </label>
                  <textarea
                    id="body-template"
                    value={bodyTemplate}
                    onChange={(e) => void handleBodyTemplateChange(e.target.value)}
                    placeholder="{{url}}"
                    className="share-input"
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                  <span className="share-project-counter">
                    プレビュー:{" "}
                    {bodyTemplate
                      .replaceAll("{{url}}", "https://example.com")
                      .replaceAll("{{title}}", "Example Title")
                      .replaceAll("{{date}}", new Date().toISOString().slice(0, 10))}
                  </span>
                </div>
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
