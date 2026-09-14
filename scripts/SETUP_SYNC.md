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
管理者権限不要。`scripts/FSM_FC_Sync.xml` をメモ帳で開き、次の2箇所を自分の環境に合わせてから登録する:

- `<WorkingDirectory>` … 自分の clone の `scripts` フォルダのパス
- `<Command>` … 自分の **pythonw.exe** のフルパス（`where pythonw` で確認）

    schtasks /Create /TN "FSM_FC_Sync" /XML "<リポジトリ>\scripts\FSM_FC_Sync.xml" /F
    schtasks /Run /TN "FSM_FC_Sync"

- **必ず `pythonw.exe` を使う**（`python.exe` や cmd 経由だと5分ごとに黒いコンソール窓が前面に出て、
  作業中のキーボード入力を奪う。2026-09-14 に実際に発生 → pythonw 方式へ変更）
- 動作結果は `%TEMP%\fsm_fc_sync.log` に出る（`upsert 完了: N 件` ならOK）。
  コンソールが無くてもスクリプト自身がこのファイルに書く（`FSM_FC_SYNC_LOGFILE` で変更可）
- 手動即時同期したいときはエクスプローラーから `sync_fc_requests.bat` をダブルクリック
- ※ `schtasks /SC MINUTE /ET 19:00` のワンライナー登録は「当日で失効するトリガー」になるため使わない（2026-09-11 実証）

## 4. 初回バックフィル（どちらか1台で1回だけ）

    python sync_fc_requests.py --days 60

過去60日分を10日刻み・2秒間隔で取り込みます（1〜2分）。

## 5. 物件マスタ（properties）の取り直し＝FC「物件リスト」Export の更新

タイプ / BOX / 物件名 / 住所（→エリア・県別）の供給元。**新設物件は Export し直すまで補完が効かない**ので、
物件が増えたタイミングで取り直す。同期タスクとは別作業で、**どちらか1台で実施すれば全員に反映される**
（各PCの設定ではなく Supabase を直接書き換えるため）。

1. FC で「物件リスト」を Export（xlsx）。
   **運用開始日の範囲フィルタは必ず全期間にする** —
   範囲を狭めた部分 Export を流すと現役物件が大量に消える

2. xlsx を CSV に変換

       python scripts/xlsx_to_properties_csv.py "C:\Users\000367\Downloads\物件リスト (4).xlsx"

   同じフォルダに `equipment_import_YYYY-MM-DD.csv` ができる

3. 件数を確認（ここでは書き込まない）

       node scripts/load_properties.mjs --csv "<手順2のCSV>" --dry-run

   **前回より件数が大幅に減っていたら中止**し、Export 条件を見直す（部分 Export の疑い）

4. 本実行（全削除 → 投入）。`yes` の入力を求められる

       node scripts/load_properties.mjs --csv "<手順2のCSV>"

   最後に `投入完了: DB=N 件 / CSV=N 件 OK` と件数一致が出れば成功

5. 検算。実在する号機が引けることを確認する（例: 507278 サンデュエル東鷲宮 / MRF / BOX11）

実績: 2026-08-25 版 54,508件 → 2026-09-14 版 55,082件（+574）。
8/25 版には 507278 などの新設物件が無く、依頼番号を入れても補完されない状態だった。

## 6. どのPCが同期しているかの確認

同期が走るたびに、実行したPC名と時刻が `fc_sync_status` テーブルに記録される（2026-09-14 追加）。
Supabase の SQL Editor で次を実行すれば、2台とも動いているかが一目でわかる。

    SELECT hostname,
           fc_user,
           to_char(last_run_at AT TIME ZONE 'Asia/Tokyo', 'MM-DD HH24:MI:SS') AS last_run_jst,
           last_rows
    FROM fc_sync_status
    ORDER BY last_run_at DESC;

- **2行出ていて両方の時刻が5分以内**なら冗長構成が効いている
- 片方の時刻が古い＝そのPCが落ちているかタスクが無効。そのPCで `%TEMP%\fsm_fc_sync.log` を見る
- この記録は同期の「おまけ」で、書き込みに失敗しても同期本体は止まらない

※ この機能は `git pull` で最新のスクリプトを取得したPCだけが記録する。
   古いスクリプトのままだと、動いていても行が出ない点に注意。

## トラブル時
- 「FC ログイン失敗」: FC_USER/FC_PASS を再設定（コピペで）。ターミナルを開き直してから再実行
- 「Supabase upsert 失敗」: frontend/.env.local の URL/KEY を確認。
  `relation "fc_requests" does not exist` なら `sql/fc_requests.sql` を
  Supabase Dashboard の SQL Editor で実行する
- FC 側の負荷ルール: このスクリプトは1回の実行で照会1発（バックフィル時のみ10日刻み・2秒間隔）。
  間隔を5分より短くしない
