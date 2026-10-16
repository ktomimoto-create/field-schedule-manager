---
title: 行動予定・月間予定のタイムライン刷新 設計書
date: 2026-10-16
author: 上田（k_ueda@fts.co.jp）
status: proposed
reviewers: 富本さん
project: field-schedule-manager
---

# 行動予定・月間予定のタイムライン刷新 設計書

## 0. 共同制作の運用

このリポジトリは富本さんとの共同制作。**main への push・マージは富本さん承認後に限る**（main → Vercel 本番自動デプロイ、本番 DB 直結）。本設計の実装は専用の feature ブランチ（`feature/timeline-redesign` を予定）で進め、PR で確認を取る。

## 1. 目的

- 現状の表計算（スプレッドシート）風 UI を廃し、**ガント × ジャーニーのハイブリッド型タイムライン**に刷新する。
- **現地対応者と管理側でビューを分離**。現地対応者には時間縛りを与えないカード進行型、管理側には時間ガント＋移動時間の重ね描き型を提供する。
- **PC と携帯でビューを分離**。携帯では「当日・自分のみ」をデフォルトにし、ガントは PC 専用。
- 現地対応者が「開始」「完了」を押した時に、管理側へ**リアルタイム通知**を届ける。

## 2. スコープ

### 本フェーズ（Phase 1）

- 行動予定（当日）ビューの刷新: `ActionCardView`（横進行カード）/ `DayGanttView`（時間ガント＋移動オーバーレイ）
- 月間予定ビューの刷新: `MonthView` 内で **カレンダー ↔ ヒートマップ** のサブタブ切替
- 画面内通知: `NotificationToast` + `NotificationBadge`（Supabase Realtime 購読）
- ロール × デバイス自動分岐（CSS メディアクエリ + JS 判定）

### 第2段階（Phase 2）

- Teams Incoming Webhook 連携（Supabase トリガー → Edge Function → Teams）
- 既存 `GridView.tsx` / `TimelineView.tsx` / `CalendarView.tsx`（3050行）の削除

### 将来スコープ（Phase 3 以降・本設計書では枠だけ）

- **トラブルのバックヤード** — 元シート「開無」（BOX 開放中・未対応リスト）相当。発生日はあるが対応日未定の案件プール。ドラッグで `schedules` の日付に落とすと予定化。
- **トータル/リペア 対応調整表** — 元シート「対応調整用」（見積 No / 部品名 / 対応予定日 / 連絡予定日 / 立会）相当。他部署との調整フィールドを備えた未定案件プール。
- 既存 `properties`（物件マスタ 55,082 件）、`fc_requests`、`staff` との統合は既に動いているので、新たに `pending_jobs` 的テーブルを追加する想定。

## 3. ユーザーとビューの対応

| | staff（現地対応者） | manager / developer（管理側） |
|---|---|---|
| **PC（≥ 768px）** | 行動予定のみ: `ActionCardView`（自分の予定、横進行カード） | 行動予定: `DayGanttView`（全員のガント＋移動）/ 月間予定: `MonthView`（カレンダー ↔ ヒートマップ）/ 分析 / マスタ(developer のみ) |
| **携帯（< 768px）** | 行動予定のみ: `ActionCardView`（自分の予定、縦積み） | デフォルト `ActionCardView`（自分のみ）。右上の「👁 全員」トグルで全員のカード縦積みに切替。ガントは携帯では出さない |

- 画面幅は `useViewport` フックで判定（matchMedia）
- staff ロールでは他タブを DOM から出さない（単なる非活性ではなく非表示）
- 携帯 manager の「全員」モードはカードリスト。時間ガントは PC 専用

## 4. 行動予定ビュー（当日）

### 4.1 ActionCardView（現地対応者 / 携帯の管理者）

- 当日の予定を**左→右の横進行カードリスト**で表示（画面幅が足りない時は 2 列折返し、携帯は 1 列縦積みに自動切替）。
- 各カードは**ステータス色でカード全体を塗る**:
  - 完了 → 緑（薄緑背景 / 緑左ボーダー / 緑ステータスバッジ / started_at・completed_at 表示）
  - 対応中 → 青（薄青背景 / 青左ボーダー / 青バッジ / グロー付き / 開始・完了ボタン表示）
  - 未着手 → グレー（薄灰背景 / 灰左ボーダー / 「未着手」バッジ）
  - キャンセル → 赤（必要なら）
- **カードに出す項目**: `work_type`（種別バッジ）/ `property_name`（折り返し表示）/ `unit_number` / `box` / `description`（2行省略）/ `disorder_type`（障害時）/ `area + prefecture` / `started_at` + `completed_at`（本人入力）
- **カード外 上部に出す項目**: `co_worker`（同行者）、日付、進捗 "3件中 1件完了"、本日の休みメンバー
- **出さない項目**: `division` / `type` / `level` / `level_3` / `course` / `transport` / `sort_order` / `is_transferred` / `created_by` / `updated_by`（管理側用）
- **時刻・移動時間は出さない**。例外として `target_time` に指定（"必ず" / "10:00" / "AM" / "PM"）がある予定だけ、カード右上に**赤バッジ**で表示する。
- 「開始」ボタン → `started_at = now` を UPDATE。「完了」ボタン → `completed_at = now` と `result = '完了'` を UPDATE。
- カードクリックで `ScheduleModal`（既存）を読み取り専用で開く。本人は編集不可（結果報告のみ別モーダル）。

### 4.2 DayGanttView（管理側 PC）

- **横軸 = 時間（8:00 〜 20:00 想定、可変）**、**縦軸 = スタッフ**。
- 各スタッフ行に、`target_time` / `started_at` / 既定の作業長から**時間帯の帯（物件バー）**を配置。
- 帯と帯の間に**移動オーバーレイ**:
  - バーの縦中央を通る 1px の細い線
  - 線の中央に 🚗 / 🚶 アイコン + 移動時間（例: 「🚗 30分」）
  - アイコンは**線の上に重ねる**。アイコン両脇は背景色で線を割って視覚的ごちゃつきを抑える
  - 移動時間は `transport` と `area` / `prefecture` の差から簡易推定（詳細アルゴリズムは別ノート）
- 帯の色は **work_type**（定期=青 / 障害=赤 / 工事=橙 / 保守=緑）。
- 帯クリックで `ScheduleModal`（既存）を編集モードで開く。
- 帯のドラッグで時間移動／別スタッフへの配車変更（Phase 1 ではクリックのみ、ドラッグは後続）。
- 休みメンバーは行を省略 or 薄グレーで表示。

## 5. 月間予定ビュー

### 5.1 MonthView

- 画面上部にサブタブ: **カレンダー / ヒートマップ** の 2 モード。URL パラメータ `?mode=calendar|heatmap` でブックマーク可。

### 5.2 CalendarPane

- 既存 `CalendarView.tsx`（3050行）の見た目を踏襲しつつ**主要項目のみ移植**。
- 残す項目: `work_type`（種別）/ `target_time`（指定時間）/ `property_name` / `unit_number` / `description` / 休暇 / 社内。
- 廃止項目: 内部管理用の `division` / `type` / `level` / `level_3` / `box` などの常時表示。詳細は `ScheduleModal` で確認する流れに統一。
- 行＝スタッフ、列＝日付の既存レイアウトは維持。
- 更新中スピナーは**尾を引く輪のみ**（文字なし）— CLAUDE.md 2026-10-16 準拠。

### 5.3 HeatmapPane

- 行＝スタッフ、列＝日付の **ヒートマップ**。
- セルの濃度 = その日の件数（空き → 薄青 → 中青 → 濃紺）。土日は背景グレー。
- セルホバー / クリックで、その日のポップオーバーに work_type 内訳と物件名を表示。
- セルを**ダブルクリックすると行動予定ビュー**（`DayGanttView`）にその日・そのスタッフでジャンプ。

## 6. 通知

### 6.1 動作

- トリガー: `schedules.started_at` または `schedules.completed_at` が null → 値あり に変化、または `result = '完了'` が入る瞬間。
- 対象: `role in ('manager', 'developer')` の全ユーザー（当該スタッフを除外する判断は Phase 2 で検討）。
- 通知の中身:
  - 開始: 「佐藤さんが B物件（障害）を開始 10:15」
  - 完了: 「佐藤さんが B物件（障害）を完了 14:32」

### 6.2 Phase 1: 画面内トースト + バッジ

- `useRealtimeNotifications` フックで `schedules` テーブルの Realtime 更新を購読。
- 条件に合致した変化を検知したら:
  1. `NotificationToast` を右下にスライドイン（5 秒で自動消去、クリックで該当予定を開く）
  2. ヘッダーの `NotificationBadge` の未読数を +1。クリックで通知履歴ドロワーを開く
- 既読は localStorage に `lastReadNotificationAt` を保存（セッションを跨いだ既読追跡）。
- 自分が発火した通知は自分には出さない。

### 6.3 Phase 2: Teams 連携

- Supabase の `after update on schedules` トリガー → Edge Function `notify_teams` を呼ぶ。
- Edge Function は Teams Incoming Webhook URL（環境変数）に Adaptive Card を POST。
- 送信先の Teams チャネルは「field-schedule 管理チャネル」1 本（最初は固定）。
- 送信失敗はログに残し、画面内通知は常に優先発火（Teams はベストエフォート）。

## 7. コンポーネント構成

```
frontend/src/
├── App.tsx                          （既存を改修: タブ振分けロジック・Realtime 購読起点）
├── hooks/
│   ├── useViewport.ts                （新規: 画面幅判定）
│   ├── useRealtimeNotifications.ts   （新規: 開始/完了検知）
│   └── useSchedules.ts               （既存ロジック切出し、ページング対応）
├── components/
│   ├── action/
│   │   ├── ActionCardView.tsx
│   │   ├── ActionCard.tsx
│   │   └── ActionCardView.css
│   ├── day/
│   │   ├── DayGanttView.tsx
│   │   ├── GanttRow.tsx
│   │   ├── TravelOverlay.tsx
│   │   └── DayGanttView.css
│   ├── month/
│   │   ├── MonthView.tsx
│   │   ├── CalendarPane.tsx
│   │   ├── HeatmapPane.tsx
│   │   └── MonthView.css
│   └── shared/
│       ├── NotificationToast.tsx
│       ├── NotificationBadge.tsx
│       └── Spinner.tsx
└── utils/timeline/
    ├── parseTargetTime.ts            （"必ず" / "10:00" / "AM" / "PM" を解釈）
    ├── estimateTravelTime.ts         （area / prefecture / transport から簡易推定）
    └── groupByStaff.ts
```

- 既存 `GridView.tsx` / `TimelineView.tsx` / `CalendarView.tsx` は Phase 1 では残置（旧 UI として一時タブで切替可能にする案も）、本番で 2 週間問題なければ Phase 2 で削除。

## 8. データモデル変更

- 既存 `schedules` スキーマは**変更なし**で対応可能（`started_at` / `completed_at` / `result` は既に存在）。
- 通知の未読数は DB に持たず localStorage に保持。多端末で未読が揃わない点は Phase 1 の割り切り。
- Phase 2 以降のバックヤード/調整表のための `pending_jobs` テーブルは別設計書で詳細化。

## 9. UI 嗜好との整合（CLAUDE.md 準拠）

- 書体: `"BIZ UDPGothic","BIZ UDPゴシック",sans-serif`。数値列は `"BIZ UDGothic","BIZ UDゴシック"`。
- 行高: 本文 1.5、ボタン・入力 1.4（`normal` は使わない）。
- バッジ: `height: 28px; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; line-height: 1;`。アイコン 12px、lucide-react。
- カード: 固定グリッド `repeat(n, minmax(0, 1fr))`。識別テキスト（物件名・号機）は `overflow-wrap: anywhere` で折返し、省略禁止。
- 色の一貫性: work_type の色（定期=青 / 障害=赤 / 工事=橙 / 保守=緑）は、カード・ガント・ヒートマップ内訳で同じ色を使う。
- プルダウン / 日付: 共有 Select / DatePicker を使う（標準の `<select>` 禁止）。
- 読み込み: 尾を引く輪のみ（文字出さない）。
- ホバー: `translateX(3px)` + グロー、`translateY` / `scale` 禁止。ボタンは `filter: brightness(1.12)` + 1px 沈み。
- 操作部品はアイコン中心 + `title` ツールチップ、アクセントボタンはゴースト。

## 10. 実装順と検証

1. feature ブランチ作成 `feature/timeline-redesign`
2. `useViewport` / `useSchedules` / `useRealtimeNotifications` フック実装 + 単体テスト
3. `ActionCardView` + `ActionCard` 実装 → ローカルで手動検証（デモアカウント `demo-user-id` で）
4. `DayGanttView` + `TravelOverlay` 実装 → デモアカウント `demo-admin-id` で
5. `MonthView` + `CalendarPane` + `HeatmapPane` 実装
6. `NotificationToast` + `NotificationBadge` 実装（Realtime が動く環境で確認）
7. `App.tsx` のロール × デバイス分岐差替え
8. 共同制作のため PR → 富本さん確認 → main マージ

**各段階でローカル dev が本番 DB に繋がる点を忘れない**。SELECT のみで動作確認し、INSERT/UPDATE/DELETE はデモアカウント or 試験レコードで行う。

## 11. リスクとオープンクエスチョン

- `target_time` が自由入力テキストのため、ガント配置時に時間が確定できない行がある。この場合は帯を描かず、別途「時間未定」エリアに積む（詳細は実装時）。
- 移動時間の推定は `area` / `prefecture` ベースで粗い。要望が強ければ外部ジオコーディング API を Phase 2 で検討。
- `schedules` の全件取得が PostgREST の 1000 行上限に当たる懸念は既知。日付レンジを絞って取得する `useSchedules` で解消する。
- 携帯 UX は実機（iPhone / Android）で確認する。ホバー前提のインタラクションを混ぜない。

## 12. 関連

- 本設計のブレインストーミング履歴: `.superpowers/brainstorm/376-1792113032/`（ローカルのみ、gitignore 済）
- Vault: `Projects/field-schedule-manager/README.md` / `Knowledge/共同制作のため本番マージは富本さん承認後.md`
- 元シート（将来スコープ参考）: `https://docs.google.com/spreadsheets/d/1HNOcz3Z7AUsI9eLuzuk7_h69MmwOLMwHQCFWuSwPrF8` の「開無」「対応調整用」タブ
