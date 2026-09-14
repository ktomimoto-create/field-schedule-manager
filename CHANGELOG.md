# 変更履歴 (CHANGELOG)

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
