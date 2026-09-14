-- どのPCが FC 同期を実行したかの記録（2台冗長運用の稼働確認用）
-- scripts/sync_fc_requests.py が同期のたびに hostname をキーに upsert する。
-- 2026-09-14 に本番（llbefroolkndlyziiqgi）へ適用済み。これは再構築・別環境用の控え。
CREATE TABLE IF NOT EXISTS fc_sync_status (
  hostname    TEXT PRIMARY KEY,   -- 実行したPCのコンピュータ名
  fc_user     TEXT,               -- 実行時の FC_USER（社員番号）
  last_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_rows   INTEGER             -- その回に upsert した件数
);

-- 本プロジェクトは RLS を使わない運用。
-- Dashboard から作ると RLS が自動で有効になり anon キーの書き込みが 42501 で弾かれるため明示的に無効化する。
ALTER TABLE fc_sync_status DISABLE ROW LEVEL SECURITY;

-- 稼働確認クエリ（2行出ていて両方の時刻が5分以内なら冗長構成が効いている）
-- SELECT hostname,
--        fc_user,
--        to_char(last_run_at AT TIME ZONE 'Asia/Tokyo', 'MM-DD HH24:MI:SS') AS last_run_jst,
--        last_rows
-- FROM fc_sync_status
-- ORDER BY last_run_at DESC;
