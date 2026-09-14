# 変更履歴 (CHANGELOG)

## [2026-09-14] - 富本さんPC環境へのFC同期スクリプト展開・環境調査

### 導入・稼働完了 (Completed)
- **git pull origin main 実行**: 最新コミット（上田さん対応の pythonw 版同期スクリプト・XML・マニュアル）を作業端末へ取得・反映完了。
- **Python 3.12 インストール完了**: `winget` 経由で富本さんユーザー領域（`%LOCALAPPDATA%\Programs\Python\Python312`）へ Python 3.12.10（`python.exe` / `pythonw.exe`）の導入を完了。
- **資格情報登録完了**: `setup_fc_env.ps1` により富本さんのFC ID（`000644`）およびパスワードをユーザー環境変数へ安全に登録完了。
- **初回同期テスト成功**: `sync_fc_requests.py` の単体実行により、FCへのログイン成功、依頼データ1,161件の取得、およびSupabase `fc_requests` テーブルへの upsert 正常完了を確認。
- **タスクスケジューラ（FSM_FC_Sync）登録・稼働開始**: 富本さんPC環境に合わせたXML設定でタスクスケジューラへ本登録。即時実行テストにおいて画面ポップアップなし（pythonw）で1,161件の自動同期ログ出力を確認。次回以降、平日8:00〜19:00の間、5分間隔で自動同期が継続稼働。
- **Supabase容量・負荷設計の検証**: 5分間隔の定期同期（直近3日分）におけるデータ上書き（upsert）動作、ディスク消費量（1,000件で約0.2MB、年間でも数十MB規模）、およびAPIリクエスト数の安全性を検証・仕様書へ明記。





## [2026-09-14] - 同期タスクのpythonw化によるバックグラウンド改善（上田さん対応）


### 修正 (Fixed)
- **同期タスクの実行方式改善**:
  - タスクスケジューラでの5分間隔実行時、cmd.exe の黒いコンソール窓が一瞬最前面に出て作業中のキーボード入力を奪う問題を解消。
  - GUIウィンドウを表示しない pythonw.exe 直接実行方式（FSM_FC_Sync.xml の <Command> を pythonw.exe に変更、Hidden=true を追加）に変更。
  - コンソール非表示に伴い、スクリプト（scripts/sync_fc_requests.py）自身が %TEMP%\fsm_fc_sync.log へ自己ログ出力する仕組みを追加。
  - 不要となった sync_fc_requests_task.bat を削除。
  - scripts/SETUP_SYNC.md に pythonw.exe 必須の理由と設定方法を明記。

---

## [2026-09-11] - FC依頼同期・サイドバー刷新・UI改善

### 追加 (Added)
- **FC物件リスト変換ツール**（上田さん）:
  - scripts/xlsx_to_properties_csv.py を追加。FCからエクスポートした物件リスト.xlsxを properties 投入用CSVへ自動変換。
- **FC依頼自動補完・同期バッチ**（上田さん）:
  - scripts/sync_fc_requests.py によりFCの依頼データを c_requests テーブルへ自動同期。
  - 予定編集画面・月間カレンダーセル・Ctrl+Vペーストでの依頼番号からの自動補完を実装。
- **予定入力サイドバー刷新（スマートカード型）**（富本さん）:
  - 物件情報、日程・対応者、作業内容、管理情報の4ブロックに整理。
  - 同行者プルダウン複数選択＋フリー入力対応。区分デフォルト値を「FTS」に設定。
- **UI・入力改善**（富本さん）:
  - 画面表示サイズ（80%〜125%）変更機能と下部余白解消。
  - 時間表記（	arget_time）の自動統一・正規化パーサー（AM/PM/必ず/HH:MM/HH:MM迄）。
  - Supabase Realtime Presenceによる同一予定の同時編集排他ロック機能。
