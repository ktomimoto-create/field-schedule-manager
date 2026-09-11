# FC依頼同期のセットアップ（k_ueda / 富本 各自のPCで実施）

アプリの「依頼番号→自動補完」は、このPC上の同期スクリプトが5分おきに
FC の依頼一覧を Supabase (fc_requests) へ写すことで動きます。
2台のどちらかが起動していれば同期は継続します（同時実行しても衝突しません）。

## 前提
- 社内ネットに接続された Windows PC / Python 3 インストール済み
- このリポジトリを clone 済み / `frontend/.env.local` を `.env.example` からコピー済み

## 1. FC 資格情報を環境変数に設定（各自のIDで）
PowerShell で対話式スクリプトを実行（自分のユーザー環境変数に保存。リポジトリには絶対に書かない）:

    cd <リポジトリ>\scripts
    powershell -ExecutionPolicy Bypass -File .\setup_fc_env.ps1

ID とパスワードを聞かれるので入力する（パスワードは画面に表示されない）。

## 2. 動作確認（新しいターミナルを開き直して）

    cd <リポジトリ>\scripts
    python sync_fc_requests.py

「upsert 完了: N 件」が出ればOK。

## 3. タスクスケジューラ登録（平日 8:00〜19:00 を5分間隔）
管理者権限不要。`scripts/FSM_FC_Sync.xml` をメモ帳で開き、`<WorkingDirectory>` を
自分の clone の `scripts` フォルダのパスに書き換えて保存してから:

    schtasks /Create /TN "FSM_FC_Sync" /XML "<リポジトリ>\scripts\FSM_FC_Sync.xml" /F
    schtasks /Run /TN "FSM_FC_Sync"

- 動作結果は `%TEMP%\fsm_fc_sync.log` に出る（`upsert 完了: N 件` ならOK）
- 手動即時同期したいときはエクスプローラーから `sync_fc_requests.bat` をダブルクリック
- ※ `schtasks /SC MINUTE /ET 19:00` のワンライナー登録は「当日で失効するトリガー」になるため使わない（2026-09-11 実証）

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
