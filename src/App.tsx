import { useCallback, useEffect, useRef, useState } from "react";
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
  const initialSharedRef = useRef<string | null>(null);

  const generate = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed || !isValidHttpUrl(trimmed)) {
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
    window.location.hash = next === "usage" ? "#usage" : "";
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
                  Open in {DEFAULT_PROJECT}
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
                onClick={() => handleViewChange("usage")}
              >
                使い方を見る
              </button>
            </footer>
          </>
        ) : (
          <>
            <section className="share-usage">
              <h2>使い方</h2>
              <p className="share-usage-description">
                Web Share Targetで共有されたURLのタイトルを <code>fetch.nibo.sh?as=title</code>{" "}
                で取得し、Cosenseページ作成リンクを生成するPWAです。
                <br />
                生成されたリンクを開くと{" "}
                <code>
                  https://scrapbox.io/{DEFAULT_PROJECT}/&lt;title&gt;?body=&lt;url&gt;
                </code>{" "}
                で新規ページが作成されます。
              </p>
              <p className="share-project">
                作成先プロジェクト: <code>{DEFAULT_PROJECT}</code>
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
        )}
      </main>
    </div>
  );
}
