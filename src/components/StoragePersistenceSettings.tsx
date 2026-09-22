import type { StoragePersistence } from "../lib/storagePersistence";

export type StoragePersistenceSettingsProps = {
  /** null はまだ確認中。確認できるまで警告も成功表示も出さない */
  persistence: StoragePersistence | null;
  /** リクエスト中はボタンを止める */
  requesting: boolean;
  onRequest: () => void;
};

/**
 * 設定画面の「データの保存」欄。
 *
 * best-effort のままなら、Chromeがsite engagement不足で初回リクエストを断った
 * 場合に備えて再試行ボタンを出す。インストール後に頼み直すと許可されやすい。
 */
export function StoragePersistenceSettings({
  persistence,
  requesting,
  onRequest,
}: StoragePersistenceSettingsProps) {
  return (
    <div className="share-ai-settings">
      <h3>データの保存</h3>
      {persistence === null && <p className="share-loading">保存領域の状態を確認中...</p>}
      {persistence === "persisted" && (
        <p className="share-settings-description">
          保存領域は永続化されています。プロジェクトと設定は、ブラウザのサイトデータを削除しない限り保持されます。
        </p>
      )}
      {persistence === "unsupported" && (
        <p className="share-warning">
          このブラウザは保存領域の永続化に対応していません。端末の空き容量が少なくなると、登録したプロジェクトや設定が削除されることがあります。
        </p>
      )}
      {persistence === "bestEffort" && (
        <>
          <p className="share-warning">
            保存領域が永続化されていません。端末の空き容量が少なくなると、登録したプロジェクトや設定がブラウザによって削除されることがあります。
          </p>
          <p className="share-settings-description">
            ホーム画面に追加（PWAとしてインストール）した状態でリクエストすると許可されやすくなります。
          </p>
          <div className="share-project-actions">
            <button
              type="button"
              className="share-button small"
              onClick={onRequest}
              disabled={requesting}
            >
              {requesting ? "リクエスト中..." : "永続化をリクエスト"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
