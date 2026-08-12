import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROJECT } from "./config";
import { buildCosenseUrl, extractSharedUrl } from "./lib/cosense";
import { fetchTitle } from "./lib/fetchTitle";
import "./App.css";

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function App() {
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

  // Auto-handle Share Target GET params: ?url=&text=&title=
  useEffect(() => {
    const shared = extractSharedUrl(window.location.search);
    if (shared) {
      setInputUrl(shared);
      void generate(shared);
    }
  }, [generate]);

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
    <main className="share-container">
      <header className="share-header">
        <h1>share2cosense</h1>
        <p className="share-description">
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
      </header>

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

      <section className="share-help">
        <h2>使い方</h2>
        <ol>
          <li>スマホの「共有」から share2cosense を選択（PWAをインストールすると共有先に表示）</li>
          <li>または上記入力欄にURLを貼り付けて「リンク生成」</li>
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
      </section>
    </main>
  );
}
