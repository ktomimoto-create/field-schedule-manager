# 依頼番号による自動補完（FC連携）設計書

- 日付: 2026-09-11
- 対象: field-schedule-manager（現地対応予定・行動管理システム）
- 目的: 予定入力時に「依頼番号」を入れたら、タイプ / BOX / 号機 / 物件名 / エリア / 県別 が自動で埋まるようにする

## 背景と制約

- FC（Ｆコミュニケーション、`http://fcweb.ftsosa`）は社内ネット専用・http・Cookie セッション認証。
  Vercel 上の本アプリ（https）からブラウザ経由で直接 fetch することは不可（mixed content + CORS）。
- FC の依頼データ（chk_irai / lst_detail）から直接取れるのは 物件名・号機・住所 まで。
  タイプ・BOX は FC 内でも号機キーの物件マスタ側の情報。エリア・県別は FC に列が無く、住所から導出する。
- 本アプリの Supabase `properties` は現在セットアップ SQL のダミー1万件のままで、実号機は1件も無い
  （既存の号機→自動補完は実質機能していない）。
- 「タイプ」は FC 物件リスト Export の「タイプ名」（RA2 / M / H / K / FRC 等）を採用する（2026-09-11 ユーザー確定）。
- 起票直後のチケットをすぐ予定に入れたいケースがある → 同期は日次でなく業務時間中5分間隔とする
  （2026-09-11 ユーザー指定。fc-ops 常駐ウォッチの60秒ポーリングより軽い負荷で安全圏）。

## 全体構成（データの流れ）

```
FC (社内)                      ユーザーPC                     Supabase                    アプリ
──────────                 ─────────────              ─────────────            ─────────────
物件リストExport ──(手動/随時)──> 取込スクリプト ──────> properties (実データ)  ─┐
lst_detail.php  ──(5分毎)─────> 同期スクリプト ──────> fc_requests (新設)     ─┼─> 依頼番号入力
                                                                             │    → 号機解決
                                                                             │    → マスタ補完
                                                                             └─> タイプ/BOX/物件名
                                                                                  + addressResolver
                                                                                  → エリア/県別
```

アプリは Supabase だけを見る。FC へのアクセスはユーザーPC上のスクリプトのみが行う。

## ① 物件マスタ（properties）の実データ入れ替え

- 現行のダミー1万件を全削除し、FC「物件リスト」Export 由来の実データ（約4万件）を投入する。
  `schedules` から `properties` への FK は無く、予定データには影響しない。
- 初回データ: fc-ops の `out/equipment_import_2026-08-25.csv`（UTF-8 BOM、ヘッダ:
  `machine_number, property_name, prefectures, rooms, box_count, case_count, address, start_date, model, type_name, program, service`）。
- 列マッピング:

  | properties 列 | 取得元 | 備考 |
  |---|---|---|
  | `unit_number` | `machine_number` | ゼロ埋めなしの文字列。schedules の号機表記と同形式 |
  | `property_name` | `property_name` | 全角スペース等はそのまま保持（識別テキストは省略しない） |
  | `address` | `prefectures` + `address` 連結 | CSV の address 列は県名を含まないため。addressResolver は県名開始前提 |
  | `box_count` | `box_count` | 整数 |
  | `model_type` | `type_name` | =「タイプ」欄に入る値 |

- 実装: `scripts/load_properties.mjs`（Node、依存追加なし・fetch で Supabase REST を直叩き）。
  1. 投入前に現件数と内容サンプルを表示し、確認プロンプト
  2. `properties` 全削除 → CSV を1000件ずつバッチ INSERT
  3. 完了後に件数検算（CSV 行数 = DB 件数）
- 更新運用: FC から Export を取り直したら同スクリプトを再実行（全洗い替え・冪等）。
  Export の取得手順は fc-ops `docs/10_equipment-refresh.md` に既存。

## ② FC 依頼の同期テーブル `fc_requests`（新設）

### テーブル定義（sql/fc_requests.sql）

```sql
CREATE TABLE fc_requests (
  refno TEXT PRIMARY KEY,          -- 依頼番号（11桁）
  unit_number TEXT NOT NULL,       -- 号機
  property_name TEXT,              -- 物件名
  address TEXT,                    -- 住所（lst_detail の住所列）
  request_date TEXT,               -- 依頼日 YYYY-MM-DD
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 同期スクリプト `scripts/sync_fc_requests.py`

- ユーザーPC（社内ネット）で動く Python 標準ライブラリのみのスクリプト。
- ログイン: `POST /fc/main/login.php`（`txt_LoginID` / `txt_PassWord`、cp932、CookieJar）。
  `Daily exclusive possession/tools/fc_taio_plan.py` の実績方式を踏襲。
  資格情報は環境変数 `FC_USER` / `FC_PASS`（リポジトリには置かない）。
  Supabase 書き込みは環境変数 `FSM_SUPABASE_URL` / `FSM_SUPABASE_KEY`。
- 取得: `POST /fc/main/lst_detail.php` に `iraidt_f`/`iraidt_t` = 直近3日（YYMMDD）で1回だけ照会。
  Shift-JIS デコード、生 HTML を正規表現でパース（DOMParser 不使用の fc-ops 方式）。
  行から hidden `refno`、号機（cells[2]）、物件名（cells[3]）、住所（cells[4]）を抽出。
- 書き込み: Supabase REST へ `Prefer: resolution=merge-duplicates` で upsert（キー refno）。
- 負荷ガード: 照会は1実行1リクエスト。タイムアウト 45 秒。`status=6`（対応報告済み）指定の照会は行わない。
  失敗時は次回実行に任せて即終了（リトライ連打しない）。
- 実行間隔: タスクスケジューラで平日 8:00–19:00 の5分間隔 + 8:00 に1回。
  手動実行用に `scripts/sync_fc_requests.bat` を用意（急ぎで同期したいとき用）。
- 初回バックフィル: 運用開始時に1回だけ `--days 60` オプションで過去60日分を月単位に分割して取り込む
  （FC 負荷を考慮し照会間隔 2 秒、fc-load-reduction のルール準拠）。以降の定期実行は直近3日のみ。
- 保持: 古い行は消さない（依頼番号は一意で容量も小さいため蓄積で問題ない）。

## ③ アプリ側の変更（ScheduleModal）

- 依頼番号欄の `onBlur` に補完処理を追加:
  1. 入力値を trim。空なら何もしない
  2. `fc_requests` を `eq('refno', 入力値)` で1件検索（タイムアウト15秒）
  3. ヒット時: 号機欄が空なら号機をセットし、既存の `handleUnitNumberBlur` と同じロジックで
     `properties` を引いて タイプ / BOX / 物件名 / エリア / 県別 を補完。
     物件マスタに号機が無い場合は `fc_requests` の物件名・住所をフォールバックとして使い、
     住所を `resolveAddress` に通してエリア・県別を出す
  4. **手入力済みの項目は上書きしない**（既存の号機補完と同じ流儀）
  5. ミス時: 依頼番号欄の下に小さく「FC同期にまだ無い番号です。号機を入力すると残りが補完されます」と表示
     （alert は出さない。入力の流れを止めない）
- 対象は詳細編集モーダル（ScheduleModal）のみ。カレンダーのインラインセル編集は対象外（v1）。
- 補完ロジックは `handleUnitNumberBlur` と共通化する（号機→マスタ→addressResolver の部分を関数に切り出し）。

## エラー処理

- 同期スクリプト: ログイン失敗・タイムアウト・パース0件はログに書いて exit 1（次回実行でリカバリ）。
- アプリ: fc_requests 検索の失敗は補完スキップ扱い（コンソールにのみ出力）。保存動作には影響させない。

## テスト

- `load_properties.mjs`: 投入後に既知の号機（例: 507278）で `properties` を引き、物件名・BOX・タイプが
  FC の表示と一致することを確認。
- `sync_fc_requests.py`: 手動実行し、当日の実依頼番号が fc_requests に入ること・再実行しても重複しないことを確認。
- アプリ: ローカル (5173) で実依頼番号を入力し、6項目が埋まること・入力済み項目が上書きされないこと・
  未同期番号でヒント表示が出ることを確認。`npm run build`（tsc）が通ること。

## 制約・既知の割り切り

- 同期間隔（5分）の隙間に起票された依頼は引けない → 号機手入力フォールバックで対応。
  必要なら `sync_fc_requests.bat` を叩けば即反映。
- 同期スクリプトが動くのは k_ueda の PC のみ（FC 資格情報を持つ PC）。PC が落ちている間は同期が止まる。
- addressResolver は関東近郊の県のみ対応。関西等の物件はエリア・県別が空欄になる（現行仕様どおり）。
- 依頼番号の桁ゆれ（10桁デモ値など）は完全一致のみで照合し、正規化はしない。
