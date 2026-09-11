# FC依頼同期のセットアップ（k_ueda / 富本 各自のPCで実施）

アプリの「依頼番号→自動補完」は、このPC上の同期スクリプトが5分おきに
FC の依頼一覧を Supabase (fc_requests) へ写すことで動きます。
2台のどちらかが起動していれば同期は継続します（同時実行しても衝突しません）。

## 前提
- 社内ネットに接続された Windows PC / Python 3 インストール済み
- このリポジトリを clone 済み / `frontend/.env.local` を `.env.example` からコピー済み

## 1. FC 資格情報を環境変数に設定（各自のIDで）
PowerShell（自分のユーザー環境変数に保存。リポジトリには絶対に書かない）:

    [Environment]::SetEnvironmentVariable('FC_USER', '<社員番号>', 'User')
    [Environment]::SetEnvironmentVariable('FC_PASS', '<FCパスワード>', 'User')

※ 値は必ずコピペで入れる（目視手打ちは q/g 等の見間違い事故のもと）。

## 2. 動作確認（新しいターミナルを開き直して）

    cd <リポジトリ>\scripts
    python sync_fc_requests.py

「upsert 完了: N 件」が出ればOK。

## 3. タスクスケジューラ登録（5分間隔・8:00〜19:00）
管理者権限不要。PowerShell:

    schtasks /Create /TN "FSM_FC_Sync" /TR "\"<リポジトリ>\scripts\sync_fc_requests_task.bat\"" /SC MINUTE /MO 5 /ST 08:00 /ET 19:00 /K /F

- `sync_fc_requests_task.bat` は pause 無し・ログ付き（`%TEMP%\fsm_fc_sync.log`）
- 手動即時同期したいときはエクスプローラーから `sync_fc_requests.bat` をダブルクリック

## 4. 初回バックフィル（どちらか1台で1回だけ）

    python sync_fc_requests.py --days 60

過去60日分を10日刻み・2秒間隔で取り込みます（1〜2分）。

## トラブル時
- 「FC ログイン失敗」: FC_USER/FC_PASS を再設定（コピペで）。ターミナルを開き直してから再実行
- 「Supabase upsert 失敗」: frontend/.env.local の URL/KEY を確認。
  `relation "fc_requests" does not exist` なら `sql/fc_requests.sql` を
  Supabase Dashboard の SQL Editor で実行する
- FC 側の負荷ルール: このスクリプトは1回の実行で照会1発（バックフィル時のみ10日刻み・2秒間隔）。
  間隔を5分より短くしない
