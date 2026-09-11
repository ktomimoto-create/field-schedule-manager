-- FC 依頼の同期テーブル（scripts/sync_fc_requests.py が upsert する）
-- 実行方法: Supabase Dashboard の SQL Editor にコピー＆ペーストして実行
CREATE TABLE IF NOT EXISTS fc_requests (
  refno TEXT PRIMARY KEY,          -- 依頼番号（11桁）
  unit_number TEXT NOT NULL,       -- 号機
  property_name TEXT,              -- 物件名
  address TEXT,                    -- 住所（lst_detail の住所列）
  request_date TEXT,               -- 依頼日 YYYY-MM-DD（refno の 2〜7桁目 YYMMDD 由来）
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fc_requests_unit_number ON fc_requests(unit_number);

-- Dashboard 経由の作成では RLS が自動有効になり anon キーの書き込みが弾かれる。
-- 本プロジェクトの他テーブル（schedules 等）と同様に RLS は使わない運用のため無効化する。
ALTER TABLE fc_requests DISABLE ROW LEVEL SECURITY;
