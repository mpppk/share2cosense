import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROJECT } from "./config";
import { buildCosenseUrl, extractSharedUrl } from "./lib/cosense";
import { fetchTitle } from "./lib/fetchTitle";
import "./App.css";

type View = "generate" | "usage";

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

  const generate = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setError("URLを入力してください");
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setError("http:// または https:// で始まるURLを入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const fetchedTitle = await fetchTitle(trimmed);
      const url = buildCosenseUrl(DEFAULT_PROJECT, fetchedTitle, trimmed);
      setTitle(fetchedTitle);
      setCosenseUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "タイトルの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash === "#usage") {
      setView("usage");
    }
    const shared = extractSharedUrl(window.location.search);
    if (shared) {
      setInputUrl(shared);
      setView("generate");
      void generate(shared);
    }
  }, [generate]);

  const handleViewChange = (next: View) => {
    setView(next);
    window.location.hash = next === "usage" ? "#usage" : "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void generate(inputUrl);
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

  return (
    <div className="share-root">
      <nav className={`share-nav ${view}`}>
        {view === "generate" ? (
          <button
            type="button"
            className="share-icon-button"
            onClick={() => handleViewChange("usage")}
            aria-label="使い方を見る"
            title="使い方"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="share-back-button"
            onClick={() => handleViewChange("generate")}
            aria-label="リンク生成に戻る"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            リンク生成に戻る
          </button>
        )}
      </nav>

      <main className="share-container">
        {view === "generate" ? (
          <>
            <form className="share-form" onSubmit={handleSubmit}>
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
                <button type="submit" className="share-button" disabled={loading}>
                  {loading ? "取得中..." : "リンク生成"}
                </button>
              </div>
              {error && (
                <p className="share-error" role="alert">
                  {error}
                </p>
              )}
            </form>

            {cosenseUrl && title && (
              <section className="share-result" aria-live="polite">
                <h2>生成結果</h2>
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
                  <a
                    href={cosenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="share-button secondary link"
                  >
                    Cosenseで開く
                  </a>
                </div>
                <p className="share-hint">
                  リンクを開くとCosenseで <code>{title}</code>{" "}
                  ページが作成され、本文に共有元URLが自動挿入されます。既存ページの場合はそのページが開きます。
                </p>
              </section>
            )}
          </>
        ) : (
          <section className="share-usage">
            <h2>使い方</h2>
            <p className="share-usage-description">
              Web Share Targetで共有されたURLのタイトルを <code>fetch.nibk.sh?as=title</code>{" "}
              で取得し、Cosenseページ作成リンクを生成するPWAです。
              <br />
              生成されたリンクを開くと{" "}
              <code>https://scrapbox.io/{DEFAULT_PROJECT}/&lt;title&gt;?body=&lt;url&gt;</code>{" "}
              で新規ページが作成されます。
            </p>
            <p className="share-project">
              作成先プロジェクト: <code>{DEFAULT_PROJECT}</code>（現在は固定、将来選択式に対応予定）
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
                <code>https://fetch.nibk.sh/&lt;host&gt;&lt;path&gt;?as=title</code>{" "}
                で取得します。失敗時は共有元URL自体をタイトルとして使用します。
              </p>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}
