# 行動予定・月間予定のタイムライン刷新（Phase 1）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 表計算風の「予定表」「当日行動予定表」「月間予定表」に代わる新しい画面を作る。現地対応者には横に進むカード、管理側の PC には担当×時間のガント（移動の目安つき）、月間はカレンダー／ヒートマップの切替。現地で「開始」「完了」が押されたら、管理側の画面に通知を出す。

**Architecture:** 新しい画面は `components/action` `components/day` `components/month` `components/shared/Notification*` に分け、計算はすべて `utils/timeline/*` の純粋関数（単体テストあり）に寄せる。データ取得・保存・ロック・お試しモードは今の `App.tsx` の仕組みをそのまま使い、新画面は props で受け取るだけにする。旧画面は消さず、管理側だけ「旧画面」ボタンでタブを出し入れできるようにする（Phase 2 で削除）。設計書: `docs/superpowers/specs/2026-10-16-timeline-redesign-design.md`

**Tech Stack:** React 19 + TypeScript 6 + Vite 8、supabase-js 2（Realtime）、lucide-react、テストは Vitest 5 + Testing Library + jsdom（この計画で導入）

---

## 実行前に必ず読むこと

- **作業場所:** worktree `C:\Users\000367\dev\field-schedule-manager-wt-timeline`（ブランチ `feature/timeline-redesign`、origin/main 9b3b7f0 から作成済み）。コマンドはすべて `frontend/` で実行する。
- **共同制作:** main への push・マージは富本さんの承認後。この計画の最後は「PR の用意」まで。**ブランチの push も上田さんに確認してから**。
- **本番 DB 直結:** ローカルの dev サーバーも本番の Supabase に繋がる。画面で確認するときは**先にヘッダーの「🧪 お試しモード」を入れる**（保存・開始・完了が手元だけで済む）。通知（Realtime）の確認だけは本番の更新が要るので、Task 19 の手順で上田さんの了承を取ってから行う。
- **git:** `git add -A` / `git add .` / `git stash` / `git reset --hard` は使わない。自分が作ったファイルを名指しで `git add` し、`git commit --only <ファイル>` でコミットする。コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。
- **画面の決まり（ユーザーの確定嗜好）:** 書体は BIZ UDPゴシック、数値は BIZ UDゴシック（`.tl-num`）。行の高さは本文 1.5・ボタン 1.4。バッジは高さ 28px・アイコン 12px・横並び。アイコンは lucide（ボタン内 16px）。アクセントボタンは塗らずにゴースト。ホバーは `translateX(3px)`＋グロー、`translateY`/`scale` は使わない（ボタンの押下は `top:1px` で沈める）。読み込み中は既存の `Spinner`（文字は出さない）。プルダウンは既存の共有 `Select`（標準の select 要素は使わない）。

## 設計書からの調整（実装時に決めたこと）

1. **時間の決まっていない予定もガントに置く。** 設計書 §11 は「時間未定エリアに積む」だったが、本番の予定 68 件のうち指定時間が空のものが 28 件あり、別エリアに出すとガントがほぼ空になる。並び順どおりに「前の作業の終わり＋移動の目安」から 1 件 60 分で置き、**点線**で「目安」と分かるようにする。時刻指定・実績は実線。
2. **`useSchedules`（取得の切り出し）は作らない。** App の取得処理はお試しモード・アバター・拠点分離と絡むので大きく動かさず、1000 件上限への対策として `fetchAllRows`（1000 件ずつ取る）だけ入れる。
3. **開始・完了の時刻は今の保存形式（"HH:MM" の文字列・日本時間）で入れる。** 開始で `result='作業中'`・`started_at`、完了で `result='完了'`・`completed_at`（開始が空なら同じ時刻も入れる）。既存の `handleUpdateScheduleResult` をそのまま使う（監査ログも残る）。
4. **旧画面の出し方:** 管理側だけ、ヘッダーの時計まわりアイコン（History）で旧タブ 3 つを出し入れ（localStorage `field_app_legacy_ui`）。現地対応者は新しい「行動予定」だけ。
5. **書体は新しい画面の中だけ BIZ UDPゴシック。** ヘッダー・旧画面は今の Outfit / Noto Sans JP のまま（富本さんのアプリ全体の書体は PR で相談）。
6. **移動の目安:** `transport` は本番で全件空なので、アイコンは既定で車。エリアが同じ 15 分・県別が同じ 30 分・不明 30 分・県別が違う 60 分。
7. **ヒートマップから飛ぶ先**（その日の行動予定）には、行動予定へ移した予定だけが出る（未移行の予定は月間で見る）。

---

## File Structure

**新規**
- `frontend/vite.config.ts`（変更）— Vitest の設定を足す
- `frontend/src/test/setup.ts` — jest-dom の読み込みと後片付け
- `frontend/src/test/factories.ts` — テスト用の予定・スタッフを作る関数
- `frontend/src/utils/timeline/dates.ts` — 日本時間の日付・時刻、月の日付一覧、分⇔時刻
- `frontend/src/utils/timeline/parseTargetTime.ts` — 指定時間 → 時間軸の枠／赤バッジの文字
- `frontend/src/utils/timeline/workTone.ts` — 種別 → 色の系統、休暇・現地作業の判定
- `frontend/src/utils/timeline/progress.ts` — 進み具合（完了／対応中／未着手／キャンセル）と開始・完了の検知
- `frontend/src/utils/timeline/estimateTravelTime.ts` — 移動の目安（分・手段）
- `frontend/src/utils/timeline/groupByStaff.ts` — 担当ごとのまとめと 1 日の並び
- `frontend/src/utils/timeline/layoutDay.ts` — 1 人の 1 日をガントの帯と移動の隙間に並べる
- `frontend/src/utils/timeline/monthMatrix.ts` — 月間の行（担当）とセル（担当×日）の索引、濃さの段階
- `frontend/src/utils/timeline/notification.ts` — 通知の型・文面・未読数
- `frontend/src/utils/withTimeout.ts` — 書き込みの時間切れ（15 秒）
- `frontend/src/utils/fetchAllRows.ts` — 1000 件ずつ全件取る
- `frontend/src/hooks/useViewport.ts` — 携帯幅（767px 以下）の判定
- `frontend/src/hooks/useRealtimeNotifications.ts` — 開始・完了の通知を Realtime で受ける
- `frontend/src/styles/timeline.css` — 新画面の共通トークン（書体・種別色・進み具合色・濃さ）と部品（バッジ・ゴーストボタン）
- `frontend/src/components/action/ActionCard.tsx` / `ActionCardView.tsx` / `ActionCardView.css` — 横に進むカード
- `frontend/src/components/day/DayGanttView.tsx` / `GanttRow.tsx` / `TravelOverlay.tsx` / `DayGanttView.css` — 管理側 PC のガント
- `frontend/src/components/day/DayScreen.tsx` / `DayScreen.css` — 行動予定タブの外枠（日付・進み具合・役割×画面幅の振り分け・開始／完了）
- `frontend/src/components/month/MonthView.tsx` / `CalendarPane.tsx` / `HeatmapPane.tsx` / `MonthView.css` — 月間予定
- `frontend/src/components/shared/NotificationToast.tsx` / `NotificationBadge.tsx` / `Notification.css` — 通知

**変更**
- `frontend/package.json` — テスト用の依存とスクリプト
- `frontend/index.html` — BIZ UDPゴシック／BIZ UDゴシックの読み込み
- `frontend/src/components/ScheduleModal.tsx` — `readOnly`（見るだけ）を足す
- `frontend/src/App.tsx` — 新タブ・旧画面の出し入れ・通知・全件取得
- `walkthrough.md` — 変更履歴（担当・日時・方法・コミット）

---

### Task 1: 設計書のコミットとテスト環境

**Files:**
- Add: `docs/superpowers/specs/2026-10-16-timeline-redesign-design.md`（コピー済み）, `docs/superpowers/plans/2026-10-16-timeline-redesign.md`（この計画）
- Modify: `frontend/package.json`, `frontend/vite.config.ts`
- Create: `frontend/src/test/setup.ts`, `frontend/src/test/factories.ts`

- [ ] **Step 1: 設計書と計画をコミット**

```bash
cd C:/Users/000367/dev/field-schedule-manager-wt-timeline
git add docs/superpowers/specs/2026-10-16-timeline-redesign-design.md docs/superpowers/plans/2026-10-16-timeline-redesign.md
git commit --only docs/superpowers/specs/2026-10-16-timeline-redesign-design.md docs/superpowers/plans/2026-10-16-timeline-redesign.md -m "docs: 行動予定・月間予定のタイムライン刷新の設計書と実装計画

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: テスト用の依存を入れる**

```bash
cd frontend
npm install -D vitest@^5.0.5 jsdom@^30.1.3 @testing-library/react@^16.3.3 @testing-library/dom@^10.4.0 @testing-library/jest-dom@^6.6.3
```

`package.json` の `scripts` に次の 2 行を足す（`"preview"` の後ろ）:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: `vite.config.ts` を書き換える**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
```

- [ ] **Step 4: `src/test/setup.ts` を作る**

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 5: `src/test/factories.ts` を作る**

```ts
import type { Schedule, Staff } from '../types'

// テスト用の予定・スタッフ。必要な項目だけ上書きして使う
export const makeSchedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 1,
  status: 'confirmed',
  division: null,
  type: null,
  box: null,
  unit_number: null,
  property_name: '物件A',
  work_type: '定期',
  description: null,
  target_time: null,
  date: '2026-10-16',
  staff_id: 1,
  area: '江東区',
  prefecture: '23',
  transport: null,
  co_worker: null,
  request_number: null,
  time_limit: null,
  course: null,
  result: null,
  started_at: null,
  completed_at: null,
  notes: null,
  disorder_type: null,
  level: null,
  level_3: null,
  is_transferred: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

export const makeStaff = (overrides: Partial<Staff> = {}): Staff => ({
  id: 1,
  name: '佐藤 太郎',
  default_course: '1',
  is_active: 1,
  role: 'staff',
  ...overrides,
})
```

- [ ] **Step 6: テストが空でも動くことを確かめる**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found, exiting with code 0`

Run: `npm run build`
Expected: エラーなしで `dist/` ができる（`tsc -b` が setup.ts / factories.ts も型チェックする）

- [ ] **Step 7: dev サーバー用の接続設定をコピー（git には入らない）**

```bash
cp C:/Users/000367/dev/field-schedule-manager/frontend/.env.local ./.env.local
git status --short   # .env.local が出ないこと（.gitignore 済み）
```

- [ ] **Step 8: コミット**

```bash
git add package.json package-lock.json vite.config.ts src/test/setup.ts src/test/factories.ts
git commit --only package.json package-lock.json vite.config.ts src/test/setup.ts src/test/factories.ts -m "chore: Vitest と Testing Library を導入

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 日付・時刻の小道具 `dates.ts`

**Files:**
- Create: `frontend/src/utils/timeline/dates.ts`
- Test: `frontend/src/utils/timeline/dates.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { addDays, addMonths, hmToMin, minToHm, monthDays, nowHmJst, todayJst, weekdayJa, weekdayOf } from './dates'

describe('dates', () => {
  it('todayJst は日本時間の日付を返す（UTC 20 時＝日本の翌朝 5 時）', () => {
    expect(todayJst(new Date('2026-10-15T20:00:00Z'))).toBe('2026-10-16')
  })

  it('nowHmJst は 24 時間制の HH:MM（既存の started_at と同じ形）', () => {
    expect(nowHmJst(new Date('2026-10-16T00:05:00Z'))).toBe('09:05')
    expect(nowHmJst(new Date('2026-10-16T15:30:00Z'))).toBe('00:30')
  })

  it('addDays は月・年をまたぐ', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('weekdayOf / weekdayJa', () => {
    expect(weekdayOf('2026-10-16')).toBe(5)
    expect(weekdayJa('2026-10-18')).toBe('日')
  })

  it('monthDays はその月の全日付', () => {
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2026-10')[30]).toBe('2026-10-31')
  })

  it('addMonths は年をまたぐ', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('hmToMin / minToHm', () => {
    expect(hmToMin('9:30')).toBe(570)
    expect(hmToMin('11:30迄')).toBe(690)
    expect(hmToMin('必ず')).toBeNull()
    expect(hmToMin(null)).toBeNull()
    expect(minToHm(570)).toBe('9:30')
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/dates.test.ts`
Expected: FAIL（`Failed to resolve import "./dates"`）

- [ ] **Step 3: 実装**

```ts
// 日付・時刻はすべて日本時間で扱う。
// （new Date().toISOString() は UTC なので、朝 9 時前は前日の日付になる）
const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const hmFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 今日の日付 "YYYY-MM-DD"（日本時間） */
export const todayJst = (now: Date = new Date()): string => ymdFormatter.format(now)

/** いまの時刻 "HH:MM"（日本時間・24 時間制）。started_at / completed_at の保存形式と同じ */
export const nowHmJst = (now: Date = new Date()): string => hmFormatter.format(now)

const parseYmd = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export const addDays = (ymd: string, days: number): string => {
  const dt = parseYmd(ymd)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** 0=日 … 6=土 */
export const weekdayOf = (ymd: string): number => parseYmd(ymd).getUTCDay()

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土']
export const weekdayJa = (ymd: string): string => WEEKDAY_JA[weekdayOf(ymd)]

/** "YYYY-MM" の月の全日付 */
export const monthDays = (ym: string): string[] => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

export const addMonths = (ym: string, months: number): string => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7)
}

/** "H:MM" / "HH:MM"（後ろに文字があっても先頭の時刻を読む）→ 0:00 からの分。読めなければ null */
export const hmToMin = (hm: string | null | undefined): number | null => {
  if (!hm) return null
  const m = String(hm).match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export const minToHm = (min: number): string => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/dates.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add src/utils/timeline/dates.ts src/utils/timeline/dates.test.ts
git commit --only src/utils/timeline/dates.ts src/utils/timeline/dates.test.ts -m "feat: 日本時間の日付・時刻の小道具（タイムライン用）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 指定時間の解釈 `parseTargetTime.ts`

**Files:**
- Create: `frontend/src/utils/timeline/parseTargetTime.ts`
- Test: `frontend/src/utils/timeline/parseTargetTime.test.ts`

本番の指定時間の値（2026-10-16 時点）: 空 28・必ず 7・10:00 6・AM 6・13:00 5・9:00 4・11:30迄 2・PM 1・`14:00~14:30入り` 1・`14:00~14:30` 1 など。表記ゆれは既存の `normalizeTargetTime`（types.ts）で正規化してから読む。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { parseTimeSlot, targetTimeBadge } from './parseTargetTime'

describe('parseTimeSlot', () => {
  it('時刻はその時刻から 60 分', () => {
    expect(parseTimeSlot('10:00')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
    expect(parseTimeSlot('１０：００')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
    expect(parseTimeSlot('10時')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
  })

  it('AM / PM は時間帯', () => {
    expect(parseTimeSlot('AM')).toEqual({ from: 540, to: 720, kind: 'band', label: 'AM' })
    expect(parseTimeSlot('午後')).toEqual({ from: 780, to: 1020, kind: 'band', label: 'PM' })
  })

  it('「〜迄」は締切の 60 分前から締切まで', () => {
    expect(parseTimeSlot('11:30迄')).toEqual({ from: 630, to: 690, kind: 'until', label: '11:30迄' })
  })

  it('「14:00~14:30」は範囲（後ろの文字は無視）', () => {
    expect(parseTimeSlot('14:00~14:30入り')).toEqual({ from: 840, to: 870, kind: 'range', label: '14:00〜14:30' })
  })

  it('時刻の無いものは null', () => {
    expect(parseTimeSlot('必ず')).toBeNull()
    expect(parseTimeSlot('')).toBeNull()
    expect(parseTimeSlot(null)).toBeNull()
  })
})

describe('targetTimeBadge', () => {
  it('指定があれば短い文字を返す', () => {
    expect(targetTimeBadge('必ず')).toBe('必ず')
    expect(targetTimeBadge('10:00')).toBe('10:00')
    expect(targetTimeBadge('pm')).toBe('PM')
    expect(targetTimeBadge('14:00~14:30')).toBe('14:00〜14:30')
  })

  it('読めない自由文は 6 文字までに縮める', () => {
    expect(targetTimeBadge('終日指定なしです')).toBe('終日指定なし')
  })

  it('指定が無ければ null', () => {
    expect(targetTimeBadge('')).toBeNull()
    expect(targetTimeBadge(null)).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/parseTargetTime.test.ts`
Expected: FAIL（`Failed to resolve import "./parseTargetTime"`）

- [ ] **Step 3: 実装**

```ts
import { normalizeTargetTime } from '../../types'
import { hmToMin, minToHm } from './dates'

// 指定時間（target_time）→ 時間軸に置く枠（分: 0:00 からの経過分）。
// 予定表には終了時刻が無いので、時刻指定は 60 分、「〜迄」は締切の 60 分前から、AM 9-12 / PM 13-17 で置く。
export type SlotKind = 'at' | 'until' | 'band' | 'range'

export interface TimeSlot {
  from: number
  to: number
  kind: SlotKind
  label: string
}

export const parseTimeSlot = (raw: string | null | undefined): TimeSlot | null => {
  const t = normalizeTargetTime(raw)
  if (!t) return null
  if (t === 'AM') return { from: 9 * 60, to: 12 * 60, kind: 'band', label: 'AM' }
  if (t === 'PM') return { from: 13 * 60, to: 17 * 60, kind: 'band', label: 'PM' }

  const range = t.match(/^(\d{1,2}:\d{2})~(\d{1,2}:\d{2})/)
  if (range) {
    const from = hmToMin(range[1])
    const to = hmToMin(range[2])
    if (from !== null && to !== null && to > from) {
      return { from, to, kind: 'range', label: `${minToHm(from)}〜${minToHm(to)}` }
    }
  }

  if (t.endsWith('迄')) {
    const end = hmToMin(t.slice(0, -1))
    if (end === null) return null
    return { from: end - 60, to: end, kind: 'until', label: t }
  }

  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const start = hmToMin(t)
    if (start === null) return null
    return { from: start, to: start + 60, kind: 'at', label: t }
  }
  return null
}

/** カード右上の赤バッジに出す文字（指定が無ければ null）。バッジは短い語だけなので 6 文字まで */
export const targetTimeBadge = (raw: string | null | undefined): string | null => {
  const t = normalizeTargetTime(raw)
  if (!t) return null
  if (t === '必ず') return '必ず'
  const slot = parseTimeSlot(raw)
  return slot ? slot.label : t.slice(0, 6)
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/parseTargetTime.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: コミット**

```bash
git add src/utils/timeline/parseTargetTime.ts src/utils/timeline/parseTargetTime.test.ts
git commit --only src/utils/timeline/parseTargetTime.ts src/utils/timeline/parseTargetTime.test.ts -m "feat: 指定時間を時間軸の枠と赤バッジの文字に読み替える

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 種別の色と進み具合 `workTone.ts` / `progress.ts`

**Files:**
- Create: `frontend/src/utils/timeline/workTone.ts`, `frontend/src/utils/timeline/progress.ts`
- Test: `frontend/src/utils/timeline/workTone.test.ts`, `frontend/src/utils/timeline/progress.test.ts`

本番の種別: 障害 20・工事 15・依頼者承認済 11・定期 8・空 5・フリー 3・2次 2・その他・現調・設置。マスタには休暇・ミーティング・社内・研修・面談（社内用）と保守・依頼有/非認可もある。

- [ ] **Step 1: 失敗するテストを書く（2 ファイル）**

`workTone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isFieldJob, isHoliday, workTone } from './workTone'
import { makeSchedule } from '../../test/factories'

describe('workTone', () => {
  it('設計書の 4 色（定期=青・障害=赤・工事=橙・保守=緑）に振り分ける', () => {
    expect(workTone('定期')).toBe('teiki')
    expect(workTone('障害')).toBe('shogai')
    expect(workTone('2次')).toBe('shogai')
    expect(workTone('工事')).toBe('koji')
    expect(workTone('設置')).toBe('koji')
    expect(workTone('保守')).toBe('hoshu')
  })

  it('社内の予定は灰、それ以外は other', () => {
    expect(workTone('休暇')).toBe('internal')
    expect(workTone('ミーティング')).toBe('internal')
    expect(workTone('依頼者承認済')).toBe('other')
    expect(workTone(null)).toBe('other')
  })
})

describe('isHoliday / isFieldJob', () => {
  it('休暇は休み', () => {
    expect(isHoliday(makeSchedule({ work_type: '休暇' }))).toBe(true)
    expect(isHoliday(makeSchedule({ work_type: '障害' }))).toBe(false)
  })

  it('キャンセルと社内の予定は現地作業に数えない', () => {
    expect(isFieldJob(makeSchedule({ work_type: '障害' }))).toBe(true)
    expect(isFieldJob(makeSchedule({ work_type: '障害', status: 'cancelled' }))).toBe(false)
    expect(isFieldJob(makeSchedule({ work_type: '研修' }))).toBe(false)
  })
})
```

`progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectProgressEvent, progressOf } from './progress'
import { makeSchedule } from '../../test/factories'

describe('progressOf', () => {
  it('結果・時刻・状態から進み具合を決める', () => {
    expect(progressOf(makeSchedule())).toBe('todo')
    expect(progressOf(makeSchedule({ result: '作業中', started_at: '10:00' }))).toBe('active')
    expect(progressOf(makeSchedule({ started_at: '10:00' }))).toBe('active')
    expect(progressOf(makeSchedule({ result: '完了' }))).toBe('done')
    expect(progressOf(makeSchedule({ completed_at: '11:00' }))).toBe('done')
    expect(progressOf(makeSchedule({ status: 'cancelled', result: '完了' }))).toBe('cancelled')
  })
})

describe('detectProgressEvent', () => {
  it('未着手 → 対応中 は開始', () => {
    const prev = makeSchedule()
    const next = makeSchedule({ result: '作業中', started_at: '10:15' })
    expect(detectProgressEvent(prev, next)).toEqual({ kind: 'start', at: '10:15' })
  })

  it('対応中 → 完了、未着手 → 完了 は完了', () => {
    expect(detectProgressEvent(makeSchedule({ started_at: '10:15' }), makeSchedule({ started_at: '10:15', completed_at: '14:32', result: '完了' }))).toEqual({ kind: 'complete', at: '14:32' })
    expect(detectProgressEvent(makeSchedule(), makeSchedule({ result: '完了' }))).toEqual({ kind: 'complete', at: '' })
  })

  it('変化なし・取り消し・前の状態が分からないときは null', () => {
    expect(detectProgressEvent(makeSchedule({ result: '完了' }), makeSchedule({ result: '完了' }))).toBeNull()
    expect(detectProgressEvent(makeSchedule({ started_at: '10:00' }), makeSchedule())).toBeNull()
    expect(detectProgressEvent(undefined, makeSchedule({ result: '完了' }))).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/workTone.test.ts src/utils/timeline/progress.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `workTone.ts`**

```ts
import type { Schedule } from '../../types'

// 種別 → 色の系統。カード・ガント・月間・ヒートマップで同じ色を使う（色の対応を全体で一貫させる）。
// 実際の色は styles/timeline.css の --wt-* で決める。
export type WorkTone = 'teiki' | 'shogai' | 'koji' | 'hoshu' | 'internal' | 'other'

const TONE_BY_WORK_TYPE: Record<string, WorkTone> = {
  定期: 'teiki',
  障害: 'shogai',
  '2次': 'shogai',
  障害対応: 'shogai',
  工事: 'koji',
  設置: 'koji',
  保守: 'hoshu',
  休暇: 'internal',
  社内: 'internal',
  ミーティング: 'internal',
  研修: 'internal',
  面談: 'internal',
}

export const workTone = (workType: string | null | undefined): WorkTone =>
  TONE_BY_WORK_TYPE[(workType || '').trim()] ?? 'other'

export const isHoliday = (s: Pick<Schedule, 'work_type'>): boolean => (s.work_type || '').trim() === '休暇'

/** 現地の作業として件数・進み具合に数えるか（キャンセルと社内の予定は数えない） */
export const isFieldJob = (s: Pick<Schedule, 'status' | 'work_type'>): boolean =>
  s.status !== 'cancelled' && workTone(s.work_type) !== 'internal'
```

- [ ] **Step 4: 実装 `progress.ts`**

```ts
import type { Schedule } from '../../types'

export type Progress = 'done' | 'active' | 'todo' | 'cancelled'

export const PROGRESS_LABEL: Record<Progress, string> = {
  done: '完了',
  active: '対応中',
  todo: '未着手',
  cancelled: 'キャンセル',
}

type ProgressFields = Pick<Schedule, 'status' | 'result'> & Partial<Pick<Schedule, 'started_at' | 'completed_at'>>

export const progressOf = (s: ProgressFields): Progress => {
  if (s.status === 'cancelled') return 'cancelled'
  if (s.result === '完了' || s.completed_at) return 'done'
  if (s.result === '作業中' || s.started_at) return 'active'
  return 'todo'
}

/** 変更前後を比べて「開始」「完了」になった瞬間だけを拾う（通知用） */
export const detectProgressEvent = (
  prev: ProgressFields | undefined,
  next: ProgressFields,
): { kind: 'start' | 'complete'; at: string } | null => {
  if (!prev) return null
  const before = progressOf(prev)
  const after = progressOf(next)
  if (before === after) return null
  if (after === 'done') return { kind: 'complete', at: next.completed_at ?? '' }
  if (after === 'active' && before === 'todo') return { kind: 'start', at: next.started_at ?? '' }
  return null
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/workTone.test.ts src/utils/timeline/progress.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 6: コミット**

```bash
git add src/utils/timeline/workTone.ts src/utils/timeline/workTone.test.ts src/utils/timeline/progress.ts src/utils/timeline/progress.test.ts
git commit --only src/utils/timeline/workTone.ts src/utils/timeline/workTone.test.ts src/utils/timeline/progress.ts src/utils/timeline/progress.test.ts -m "feat: 種別の色の系統と進み具合（開始・完了の検知つき）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 移動の目安 `estimateTravelTime.ts`

**Files:**
- Create: `frontend/src/utils/timeline/estimateTravelTime.ts`
- Test: `frontend/src/utils/timeline/estimateTravelTime.test.ts`

本番の値: エリア＝区市名（江東区・目黒区・北区T・八千代市…）、県別＝`23`（23 区）・神奈川・千葉・埼玉・都下、移動手段＝全件空。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { estimateTravel } from './estimateTravelTime'

const at = (area: string | null, prefecture: string | null, transport: string | null = null) => ({ area, prefecture, transport })

describe('estimateTravel', () => {
  it('同じエリアは 15 分、同じ県別は 30 分、県別が違えば 60 分', () => {
    expect(estimateTravel(at('江東区', '23'), at('江東区', '23'))).toEqual({ minutes: 15, mode: 'car' })
    expect(estimateTravel(at('江東区', '23'), at('目黒区', '23'))).toEqual({ minutes: 30, mode: 'car' })
    expect(estimateTravel(at('江東区', '23'), at('八千代市', '千葉'))).toEqual({ minutes: 60, mode: 'car' })
  })

  it('場所が分からなければ 30 分', () => {
    expect(estimateTravel(at(null, null), at('江東区', '23'))).toEqual({ minutes: 30, mode: 'car' })
  })

  it('移動手段の文字から徒歩・電車を読む（空なら車）', () => {
    expect(estimateTravel(at('江東区', '23'), at('江東区', '23', '徒歩')).mode).toBe('walk')
    expect(estimateTravel(at('江東区', '23'), at('目黒区', '23', '電車')).mode).toBe('train')
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/estimateTravelTime.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装**

```ts
import type { Schedule } from '../../types'

// 移動の目安。住所の座標は持っていないので、エリア（区市）と県別だけで粗く見積もる。
// 要望が強ければ Phase 2 で地図 API を検討する（設計書 §11）。
export type TravelMode = 'car' | 'walk' | 'train'

export interface Travel {
  minutes: number
  mode: TravelMode
}

type Place = Pick<Schedule, 'area' | 'prefecture'>

const modeOf = (transport: string | null | undefined): TravelMode => {
  const t = (transport || '').trim()
  if (/徒歩|歩き/.test(t)) return 'walk'
  if (/電車|鉄道|地下鉄|JR|公共/.test(t)) return 'train'
  return 'car'
}

export const estimateTravel = (from: Place, to: Place & Pick<Schedule, 'transport'>): Travel => {
  const fromArea = (from.area || '').trim()
  const toArea = (to.area || '').trim()
  const fromPref = (from.prefecture || '').trim()
  const toPref = (to.prefecture || '').trim()

  let minutes: number
  if (fromArea && fromArea === toArea) minutes = 15
  else if (!fromPref || !toPref || fromPref === toPref) minutes = 30
  else minutes = 60

  return { minutes, mode: modeOf(to.transport) }
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/estimateTravelTime.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add src/utils/timeline/estimateTravelTime.ts src/utils/timeline/estimateTravelTime.test.ts
git commit --only src/utils/timeline/estimateTravelTime.ts src/utils/timeline/estimateTravelTime.test.ts -m "feat: エリアと県別から移動の目安を見積もる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 担当ごとのまとめと 1 日の並べ方 `groupByStaff.ts` / `layoutDay.ts`

**Files:**
- Create: `frontend/src/utils/timeline/groupByStaff.ts`, `frontend/src/utils/timeline/layoutDay.ts`
- Test: `frontend/src/utils/timeline/groupByStaff.test.ts`, `frontend/src/utils/timeline/layoutDay.test.ts`

- [ ] **Step 1: 失敗するテストを書く（2 ファイル）**

`groupByStaff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { courseOf, groupByStaff } from './groupByStaff'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('groupByStaff', () => {
  const staff = [
    makeStaff({ id: 1, name: '佐藤 太郎', default_course: '10' }),
    makeStaff({ id: 2, name: '築地 次郎', default_course: '2' }),
  ]

  it('コース番号の小さい順（数値で比べる）、担当なしは最後', () => {
    const days = groupByStaff(
      [makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: null }), makeSchedule({ id: 3, staff_id: 2 })],
      staff,
    )
    expect(days.map(d => d.name)).toEqual(['築地 次郎', '佐藤 太郎', '未割当'])
    expect(days[2].staffId).toBeNull()
  })

  it('1 人の中は当日行動予定表で並べ替えた順（sort_order）', () => {
    const days = groupByStaff(
      [makeSchedule({ id: 3, staff_id: 2, sort_order: 1 }), makeSchedule({ id: 4, staff_id: 2, sort_order: 0 })],
      staff,
    )
    expect(days[0].items.map(s => s.id)).toEqual([4, 3])
  })

  it('courseOf は数字でなければ Infinity', () => {
    expect(courseOf(makeStaff({ default_course: '3' }))).toBe(3)
    expect(courseOf(makeStaff({ default_course: '' }))).toBe(Infinity)
    expect(courseOf(undefined)).toBe(Infinity)
  })
})
```

`layoutDay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { layoutStaffDay } from './layoutDay'
import { makeSchedule } from '../../test/factories'

describe('layoutStaffDay', () => {
  it('時間の無い予定は 9:00 から 60 分ずつ、間に移動の目安を挟む', () => {
    const { bars, gaps } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2 }),
      makeSchedule({ id: 3 }),
    ])
    expect(bars.map(b => [b.from, b.to, b.basis])).toEqual([
      [540, 600, 'estimated'],
      [615, 675, 'estimated'],
      [690, 750, 'estimated'],
    ])
    expect(gaps).toHaveLength(2)
    expect(gaps[0]).toMatchObject({ from: 600, to: 615, travel: { minutes: 15, mode: 'car' } })
  })

  it('時刻指定はその時刻に置く（fixed）', () => {
    const { bars, gaps } = layoutStaffDay([makeSchedule({ id: 1 }), makeSchedule({ id: 2, target_time: '13:00' })])
    expect(bars[1]).toMatchObject({ from: 780, to: 840, basis: 'fixed' })
    expect(gaps[0]).toMatchObject({ from: 600, to: 780 })
  })

  it('開始・完了の実績があればそれを使う（actual）', () => {
    const { bars } = layoutStaffDay([makeSchedule({ started_at: '10:05', completed_at: '10:40' })])
    expect(bars[0]).toMatchObject({ from: 605, to: 640, basis: 'actual' })
  })

  it('キャンセルと休暇は置かない', () => {
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1, status: 'cancelled' }),
      makeSchedule({ id: 2, work_type: '休暇' }),
      makeSchedule({ id: 3 }),
    ])
    expect(bars.map(b => b.schedule.id)).toEqual([3])
  })

  it('PM は 13:00 より前に置かず、「〜迄」は締切に間に合う位置まで前に寄せる', () => {
    expect(layoutStaffDay([makeSchedule({ target_time: 'PM' })]).bars[0].from).toBe(780)
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2 }),
      makeSchedule({ id: 3, target_time: '11:00迄' }),
    ])
    expect(bars[2].from).toBe(600)
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/groupByStaff.test.ts src/utils/timeline/layoutDay.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `groupByStaff.ts`**

```ts
import type { Schedule, Staff } from '../../types'
import { compareSchedules } from '../../types'

export interface StaffDay {
  key: string
  staffId: number | null
  name: string
  member?: Staff
  items: Schedule[]
}

/** スタッフのコース番号（数字でなければ Infinity＝後ろ） */
export const courseOf = (member?: Staff): number => {
  const raw = String(member?.default_course ?? '').trim()
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) ? n : Infinity
}

const sortKey = (s: Schedule): number => (typeof s.sort_order === 'number' ? s.sort_order : Number.MAX_SAFE_INTEGER)

/** 1 人の 1 日の並び: 当日行動予定表で並べ替えた順（sort_order）→ 予定表と同じ並び（compareSchedules） */
export const orderInDay = (a: Schedule, b: Schedule): number => sortKey(a) - sortKey(b) || compareSchedules(a, b)

export const groupByStaff = (schedules: Schedule[], staff: Staff[]): StaffDay[] => {
  const map = new Map<string, StaffDay>()
  for (const s of schedules) {
    const member = s.staff_id !== null ? staff.find(st => st.id === s.staff_id) : undefined
    const key = member ? `id-${member.id}` : 'unassigned'
    let day = map.get(key)
    if (!day) {
      day = { key, staffId: member?.id ?? null, name: member?.name ?? '未割当', member, items: [] }
      map.set(key, day)
    }
    day.items.push(s)
  }
  const days = [...map.values()]
  for (const d of days) d.items.sort(orderInDay)
  const lastIfUnassigned = (d: StaffDay) => (d.key === 'unassigned' ? 1 : 0)
  // Infinity - Infinity は NaN（falsy）なので、コースが無い人同士は名前で比べる
  return days.sort(
    (a, b) => lastIfUnassigned(a) - lastIfUnassigned(b) || courseOf(a.member) - courseOf(b.member) || a.name.localeCompare(b.name, 'ja'),
  )
}
```

- [ ] **Step 4: 実装 `layoutDay.ts`**

```ts
import type { Schedule } from '../../types'
import { hmToMin } from './dates'
import { parseTimeSlot } from './parseTargetTime'
import { estimateTravel, type Travel } from './estimateTravelTime'
import { isHoliday } from './workTone'

export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 20 * 60
export const FIRST_JOB_MIN = 9 * 60
export const DEFAULT_WORK_MIN = 60

/** actual=実績 / fixed=時刻指定 / estimated=並び順から置いた目安（画面では点線） */
export type BarBasis = 'actual' | 'fixed' | 'estimated'

export interface GanttBar {
  schedule: Schedule
  from: number
  to: number
  basis: BarBasis
}

export interface TravelGap {
  from: number
  to: number
  travel: Travel
}

export interface DayLayout {
  bars: GanttBar[]
  gaps: TravelGap[]
}

/**
 * 1 人の 1 日の予定を時間軸に並べる。予定表には終了時刻が無いので:
 * - 開始・完了の実績があればそれを使う（actual）
 * - 時刻指定（10:00 / 14:00〜14:30）はその時刻に置く（fixed）
 * - それ以外は、前の作業の終わり＋移動の目安から順に置く（estimated）。
 *   AM/PM は帯の始まりより前には置かない。「〜迄」は締切に間に合う位置まで前に寄せる。
 * 作業時間は 1 件 60 分とみなす。items は orderInDay で並べてから渡す。
 */
export const layoutStaffDay = (items: Schedule[]): DayLayout => {
  const bars: GanttBar[] = []
  const gaps: TravelGap[] = []
  let cursor = FIRST_JOB_MIN
  let prev: GanttBar | null = null

  for (const s of items) {
    if (s.status === 'cancelled' || isHoliday(s)) continue
    const travel = prev ? estimateTravel(prev.schedule, s) : null
    const earliest = cursor + (travel ? travel.minutes : 0)
    const started = hmToMin(s.started_at)
    const completed = hmToMin(s.completed_at)
    const slot = parseTimeSlot(s.target_time)

    let from: number
    let to: number
    let basis: BarBasis
    if (started !== null) {
      from = started
      to = completed !== null && completed > started ? completed : started + DEFAULT_WORK_MIN
      basis = 'actual'
    } else if (slot && (slot.kind === 'at' || slot.kind === 'range')) {
      from = slot.from
      to = slot.kind === 'range' ? slot.to : slot.from + DEFAULT_WORK_MIN
      basis = 'fixed'
    } else if (slot && slot.kind === 'until') {
      from = Math.min(earliest, slot.to - DEFAULT_WORK_MIN)
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    } else if (slot && slot.kind === 'band') {
      from = Math.max(earliest, slot.from)
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    } else {
      from = earliest
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    }

    if (prev && travel && from > prev.to) gaps.push({ from: prev.to, to: from, travel })
    const bar: GanttBar = { schedule: s, from, to, basis }
    bars.push(bar)
    cursor = Math.max(cursor, to)
    prev = bar
  }
  return { bars, gaps }
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/groupByStaff.test.ts src/utils/timeline/layoutDay.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 6: コミット**

```bash
git add src/utils/timeline/groupByStaff.ts src/utils/timeline/groupByStaff.test.ts src/utils/timeline/layoutDay.ts src/utils/timeline/layoutDay.test.ts
git commit --only src/utils/timeline/groupByStaff.ts src/utils/timeline/groupByStaff.test.ts src/utils/timeline/layoutDay.ts src/utils/timeline/layoutDay.test.ts -m "feat: 担当ごとのまとめと、1日の予定をガントの帯・移動に並べる計算

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 書き込みの時間切れと全件取得 `withTimeout.ts` / `fetchAllRows.ts`

**Files:**
- Create: `frontend/src/utils/withTimeout.ts`, `frontend/src/utils/fetchAllRows.ts`
- Test: `frontend/src/utils/withTimeout.test.ts`, `frontend/src/utils/fetchAllRows.test.ts`
- Modify: `frontend/src/App.tsx`（予定の取得 2 か所）

- [ ] **Step 1: 失敗するテストを書く（2 ファイル）**

`withTimeout.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from './withTimeout'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('時間内に終われば結果をそのまま返す', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42)
  })

  it('時間を過ぎたら TimeoutError（何の処理かを文に入れる）', async () => {
    const pending = withTimeout(new Promise<never>(() => {}), 15_000, '開始の記録')
    vi.advanceTimersByTime(15_000)
    await expect(pending).rejects.toBeInstanceOf(TimeoutError)
    await expect(pending).rejects.toThrow('開始の記録が 15 秒たっても終わりませんでした')
  })

  it('元の失敗はそのまま返す', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })
})
```

`fetchAllRows.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

describe('fetchAllRows', () => {
  it('1 ページが満杯の間は続けて取る', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i)
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }))
    await expect(fetchAllRows(page, 2)).resolves.toEqual({ data: [0, 1, 2, 3, 4], error: null })
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('途中で失敗したらそこまでと error を返す', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(fetchAllRows(page, 2)).resolves.toEqual({ data: [1, 2], error: { message: 'x' } })
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/withTimeout.test.ts src/utils/fetchAllRows.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `withTimeout.ts`**

```ts
// 書き込み（開始・完了・移行など）は必ず時間切れ付きで呼ぶ。無限に待たせない（全プロジェクト共通の決まり）
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export const withTimeout = <T>(promise: Promise<T>, ms = 15_000, label = '処理'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label}が ${Math.round(ms / 1000)} 秒たっても終わりませんでした。通信状況を確かめて、もう一度お試しください。`))
    }, ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
```

- [ ] **Step 4: 実装 `fetchAllRows.ts`**

```ts
// PostgREST は 1 回で最大 1000 行しか返さない。予定が増えても欠けないように、1000 行ずつ続けて取る
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: all, error }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return { data: all, error: null }
  }
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/withTimeout.test.ts src/utils/fetchAllRows.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: App の予定取得を全件取得に置き換える**

`frontend/src/App.tsx` の import 群の最後（`import { Spinner, SpinnerBlock } from './components/shared/Spinner';` の次の行）に足す:

```ts
import { fetchAllRows } from './utils/fetchAllRows';
```

お試しデータのリセット（`handleResetSandboxData` の中）:

```ts
      const { data: latestSchedules, error: schedError } = await supabase.from('schedules').select('*');
```
↓
```ts
      const { data: latestSchedules, error: schedError } = await fetchAllRows((from, to) =>
        supabase.from('schedules').select('*').order('id').range(from, to)
      );
```

`fetchData` の `Promise.all` の中:

```ts
        supabase.from('schedules').select('*'),
```
↓
```ts
        fetchAllRows((from, to) => supabase.from('schedules').select('*').order('id').range(from, to)),
```

- [ ] **Step 7: 型が通ることを確かめる**

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/utils/withTimeout.ts src/utils/withTimeout.test.ts src/utils/fetchAllRows.ts src/utils/fetchAllRows.test.ts src/App.tsx
git commit --only src/utils/withTimeout.ts src/utils/withTimeout.test.ts src/utils/fetchAllRows.ts src/utils/fetchAllRows.test.ts src/App.tsx -m "feat: 書き込みの時間切れと、予定を 1000 件ずつ全件取る仕組み

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 携帯幅の判定 `useViewport.ts`

**Files:**
- Create: `frontend/src/hooks/useViewport.ts`
- Test: `frontend/src/hooks/useViewport.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useViewport } from './useViewport'

describe('useViewport', () => {
  const listeners = new Set<() => void>()
  let matches = false

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  }))

  afterEach(() => {
    matches = false
  })

  it('画面幅が 767px 以下になったら isMobile が true になる', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(false)
    act(() => {
      matches = true
      listeners.forEach(cb => cb())
    })
    expect(result.current.isMobile).toBe(true)
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/hooks/useViewport.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装**

```ts
import { useSyncExternalStore } from 'react'

// 携帯（767px 以下）かどうか。PC と携帯で画面を分ける（設計書 §3）
export const MOBILE_QUERY = '(max-width: 767px)'

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches

export const useViewport = () => ({
  isMobile: useSyncExternalStore(subscribe, getSnapshot, () => false),
})
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/hooks/useViewport.test.ts`
Expected: PASS（1 test）

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useViewport.ts src/hooks/useViewport.test.ts
git commit --only src/hooks/useViewport.ts src/hooks/useViewport.test.ts -m "feat: 携帯幅かどうかを判定するフック

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 新画面の共通スタイルと書体

**Files:**
- Create: `frontend/src/styles/timeline.css`
- Modify: `frontend/index.html`

テストは無し（見た目は Task 19 でブラウザ確認）。ダークテーマは body の `.dark-theme`（既存の切替）で上書きする。

- [ ] **Step 1: `index.html` に書体を足す**

`<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` の次の行に足す:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=BIZ+UDGothic:wght@400;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: `src/styles/timeline.css` を作る**

```css
/* 行動予定・月間予定（2026-10 刷新）の共通トークンと部品。
   色の対応（種別・進み具合・混み具合）はここで一元管理し、カード・ガント・月間・ヒートマップで同じ色を使う。 */
:root {
  --tl-font: "BIZ UDPGothic", "BIZ UDPゴシック", sans-serif;
  --tl-font-num: "BIZ UDGothic", "BIZ UDゴシック", sans-serif;

  --wt-teiki: #2563eb;
  --wt-shogai: #dc2626;
  --wt-koji: #ea580c;
  --wt-hoshu: #16a34a;
  --wt-internal: #64748b;
  --wt-other: #7c3aed;

  --pg-done: #16a34a;
  --pg-active: #2563eb;
  --pg-todo: #94a3b8;
  --pg-cancelled: #dc2626;

  --tl-urgent: #dc2626;

  --heat-0: var(--bg-empty);
  --heat-1: #dbeafe;
  --heat-2: #93c5fd;
  --heat-3: #3b82f6;
  --heat-4: #1e3a8a;
  --heat-ink-3: #ffffff;
  --heat-ink-4: #ffffff;
}

.dark-theme {
  --wt-teiki: #60a5fa;
  --wt-shogai: #f87171;
  --wt-koji: #fb923c;
  --wt-hoshu: #4ade80;
  --wt-internal: #94a3b8;
  --wt-other: #a78bfa;

  --pg-done: #4ade80;
  --pg-active: #60a5fa;
  --pg-todo: #64748b;
  --pg-cancelled: #f87171;

  --tl-urgent: #ef4444;

  --heat-1: #1e3a5f;
  --heat-2: #1d4ed8;
  --heat-3: #3b82f6;
  --heat-4: #93c5fd;
  --heat-ink-3: #ffffff;
  --heat-ink-4: #0b0f19;
}

.tl-root {
  font-family: var(--tl-font);
  line-height: 1.5;
  color: var(--text-primary);
}

.tl-root button,
.tl-root input,
.tl-root code {
  font-family: inherit;
  line-height: 1.4;
}

.tl-num {
  font-family: var(--tl-font-num);
  font-variant-numeric: tabular-nums;
}

/* 種別の色（--wt）を要素に渡す */
.tl-wt-teiki { --wt: var(--wt-teiki); }
.tl-wt-shogai { --wt: var(--wt-shogai); }
.tl-wt-koji { --wt: var(--wt-koji); }
.tl-wt-hoshu { --wt: var(--wt-hoshu); }
.tl-wt-internal { --wt: var(--wt-internal); }
.tl-wt-other { --wt: var(--wt-other); }

/* バッジ: 高さ 28px・アイコン 12px・横並び・短い語だけ */
.tl-badge {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  height: 28px;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.tl-badge svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.tl-wt-badge {
  color: var(--wt);
  background: color-mix(in srgb, var(--wt) 12%, transparent);
  border-color: color-mix(in srgb, var(--wt) 32%, transparent);
}

/* ゴーストボタン（塗りつぶさない）。色は --accent-c で渡す */
.tl-ghost-btn {
  --accent-c: var(--primary);
  position: relative;
  top: 0;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--accent-c) 35%, transparent);
  background: transparent;
  color: var(--accent-c);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast), filter var(--transition-fast);
}

.tl-ghost-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-c) 10%, transparent);
  filter: brightness(1.12);
}

.tl-ghost-btn:active:not(:disabled) {
  top: 1px;
}

.tl-ghost-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.tl-ghost-btn.is-on {
  background: color-mix(in srgb, var(--accent-c) 14%, transparent);
  border-color: var(--accent-c);
}

.tl-ghost-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tl-icon-btn {
  width: 32px;
  padding: 0;
}
```

- [ ] **Step 3: ビルドが通ることを確かめる**

Run: `npm run build`
Expected: エラーなし（CSS はまだどこからも読まれていない。Task 18 で App から読む）

- [ ] **Step 4: コミット**

```bash
git add index.html src/styles/timeline.css
git commit --only index.html src/styles/timeline.css -m "style: 新しい行動予定・月間予定の共通トークン（書体・種別色・進み具合色）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 予定モーダルに「見るだけ」を足す

**Files:**
- Modify: `frontend/src/components/ScheduleModal.tsx`

現地対応者がカードを押したときは予定の中身を見るだけにする（設計書 §4.1）。入力欄はもともと `isInputDisabled` で一括して止められるので、そこに `readOnly` を足し、保存・削除・メール連絡のボタンを出さない。

- [ ] **Step 1: props の型に足す**

```ts
  currentUserRole?: UserRole;
}
```
↓（`interface ScheduleModalProps` の最後）
```ts
  currentUserRole?: UserRole;
  /** 見るだけ（現地対応者が行動予定のカードから開いたとき）。入力・保存・削除をさせない */
  readOnly?: boolean;
}
```

- [ ] **Step 2: 引数で受ける**

```ts
  currentUserRole,
}) => {
```
↓
```ts
  currentUserRole,
  readOnly = false,
}) => {
```

- [ ] **Step 3: 入力を止める条件に足す**

```ts
  const isInputDisabled = isSubmitting || isEffectiveLocked;
```
↓
```ts
  const isInputDisabled = isSubmitting || isEffectiveLocked || readOnly;
```

- [ ] **Step 4: Enter キーでの保存も止める**

`handleSubmit` の先頭:

```ts
    e.preventDefault();
```
↓
```ts
    e.preventDefault();
    if (readOnly) return;
```

- [ ] **Step 5: 削除・メール連絡・保存のボタンを出さない、「キャンセル」を「閉じる」に**

```tsx
              {isEditMode ? (
```
↓
```tsx
              {isEditMode && !readOnly ? (
```

```tsx
              {targetStaffEmail && (
```
↓
```tsx
              {targetStaffEmail && !readOnly && (
```

```tsx
                onClick={onClose}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isInputDisabled}
                title={isEffectiveLocked ? `${lockedBy?.userName} さんが編集中です` : undefined}
              >
                {isEffectiveLocked ? `🔒 編集中 (${lockedBy?.userName})` : (isSubmitting ? '保存中...' : '予定を保存')}
              </button>
```
↓
```tsx
                onClick={onClose}
                disabled={isSubmitting}
              >
                {readOnly ? '閉じる' : 'キャンセル'}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isInputDisabled}
                  title={isEffectiveLocked ? `${lockedBy?.userName} さんが編集中です` : undefined}
                >
                  {isEffectiveLocked ? `🔒 編集中 (${lockedBy?.userName})` : (isSubmitting ? '保存中...' : '予定を保存')}
                </button>
              )}
```

- [ ] **Step 6: 型が通ることを確かめる**

Run: `npm run build`
Expected: エラーなし（既定値 false なので既存の呼び出しは変わらない）

- [ ] **Step 7: コミット**

```bash
git add src/components/ScheduleModal.tsx
git commit --only src/components/ScheduleModal.tsx -m "feat: 予定モーダルに見るだけのモード（readOnly）を足す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 横に進むカード `ActionCard` / `ActionCardView`

**Files:**
- Create: `frontend/src/components/action/ActionCard.tsx`, `ActionCardView.tsx`, `ActionCardView.css`
- Test: `frontend/src/components/action/ActionCard.test.tsx`, `ActionCardView.test.tsx`

カードの中身（設計書 §4.1）: 種別バッジ・物件名（折り返して全部見せる）・号機・BOX・場所（エリア＋県別）・作業内容（2 行で省略）・障害区分・開始／完了の時刻。時刻と移動時間は出さない。指定時間がある予定だけ右上に赤バッジ。カード全体を進み具合の色で塗る。

- [ ] **Step 1: 失敗するテストを書く**

`ActionCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActionCard } from './ActionCard'
import { makeSchedule } from '../../test/factories'

const renderCard = (overrides: Parameters<typeof makeSchedule>[0], canReport = true) => {
  const handlers = { onOpen: vi.fn(), onStart: vi.fn(), onComplete: vi.fn() }
  render(<ActionCard schedule={makeSchedule(overrides)} order={1} canReport={canReport} busy={false} {...handlers} />)
  return handlers
}

describe('ActionCard', () => {
  it('未着手: 物件名・種別・指定時間・開始ボタン。開始を押してもカードは開かない', () => {
    const h = renderCard({ property_name: 'B物件', work_type: '障害', target_time: '10:00', unit_number: '1号機' })
    expect(screen.getByText('B物件')).toBeInTheDocument()
    expect(screen.getByText('障害')).toBeInTheDocument()
    expect(screen.getByText('未着手')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('1号機')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    expect(h.onStart).toHaveBeenCalledTimes(1)
    expect(h.onOpen).not.toHaveBeenCalled()
  })

  it('対応中: 完了ボタン', () => {
    const h = renderCard({ result: '作業中', started_at: '10:05' })
    expect(screen.getByText('対応中')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /完了/ }))
    expect(h.onComplete).toHaveBeenCalledTimes(1)
  })

  it('完了: ボタンは出さず開始・完了の時刻を出す', () => {
    renderCard({ result: '完了', started_at: '10:05', completed_at: '10:40' })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('10:05')).toBeInTheDocument()
    expect(screen.getByText('10:40')).toBeInTheDocument()
  })

  it('報告できない人にはボタンを出さない。カードを押すと開く', () => {
    const h = renderCard({}, false)
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByText('物件A'))
    expect(h.onOpen).toHaveBeenCalledTimes(1)
  })
})
```

`ActionCardView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionCardView } from './ActionCardView'
import { makeSchedule, makeStaff } from '../../test/factories'

const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]
const props = { staff, canReportFor: () => true, busyId: null, onOpen: vi.fn(), onStart: vi.fn(), onComplete: vi.fn() }

describe('ActionCardView', () => {
  it('全員を見るときは人ごとに見出し（完了数/件数）を付け、休暇はカードにしない', () => {
    render(
      <ActionCardView
        {...props}
        grouped
        schedules={[
          makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟', result: '完了' }),
          makeSchedule({ id: 2, staff_id: 2, property_name: 'B棟' }),
          makeSchedule({ id: 3, staff_id: 2, work_type: '休暇', property_name: '休み' }),
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: /佐藤/ })).toHaveTextContent('1/1')
    expect(screen.getByRole('heading', { name: /築地/ })).toHaveTextContent('0/1')
    expect(screen.queryByText('休み')).toBeNull()
  })

  it('予定が無ければその旨を出す', () => {
    render(<ActionCardView {...props} grouped={false} schedules={[]} />)
    expect(screen.getByText('この日の予定はありません')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/action`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `ActionCard.tsx`**

```tsx
import type { CSSProperties } from 'react'
import { Box, Check, Clock, Hash, MapPin, Play, TriangleAlert } from 'lucide-react'
import type { Schedule } from '../../types'
import { PROGRESS_LABEL, progressOf } from '../../utils/timeline/progress'
import { targetTimeBadge } from '../../utils/timeline/parseTargetTime'
import { workTone } from '../../utils/timeline/workTone'
import { Spinner } from '../shared/Spinner'

interface Props {
  schedule: Schedule
  /** その人の何件目か */
  order: number
  /** 開始・完了を押せるか（本人の予定、または管理側） */
  canReport: boolean
  busy: boolean
  onOpen: (s: Schedule) => void
  onStart: (s: Schedule) => void
  onComplete: (s: Schedule) => void
}

const placeOf = (s: Schedule): string => {
  const pref = s.prefecture === '23' ? '23区' : s.prefecture
  return [s.area, pref].filter(Boolean).join(' / ')
}

export function ActionCard({ schedule: s, order, canReport, busy, onOpen, onStart, onComplete }: Props) {
  const progress = progressOf(s)
  const badge = targetTimeBadge(s.target_time)
  const place = placeOf(s)

  return (
    <article
      className={`ac-card ac-${progress} tl-wt-${workTone(s.work_type)}`}
      tabIndex={0}
      aria-label={`${s.property_name || '物件名なし'} の詳細を開く`}
      onClick={() => onOpen(s)}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(s)
      }}
    >
      <div className="ac-head">
        <span className="ac-order tl-num">{order}</span>
        <span className="tl-badge tl-wt-badge">{s.work_type || '種別なし'}</span>
        <span className="tl-badge ac-progress-badge">{PROGRESS_LABEL[progress]}</span>
        {badge && (
          <span className="tl-badge ac-urgent" title="指定時間">
            <Clock size={12} />
            {badge}
          </span>
        )}
      </div>

      <h3 className="ac-title">{s.property_name || '（物件名なし）'}</h3>

      <dl className="ac-meta">
        {s.unit_number && (
          <>
            <dt><Hash size={12} />号機</dt>
            <dd>{s.unit_number}</dd>
          </>
        )}
        {s.box && (
          <>
            <dt><Box size={12} />BOX</dt>
            <dd>{s.box}</dd>
          </>
        )}
        {place && (
          <>
            <dt><MapPin size={12} />場所</dt>
            <dd>{place}</dd>
          </>
        )}
        {s.disorder_type && (
          <>
            <dt><TriangleAlert size={12} />障害</dt>
            <dd>{s.disorder_type}</dd>
          </>
        )}
      </dl>

      {s.description && <p className="ac-desc">{s.description}</p>}

      <div className="ac-foot">
        {(s.started_at || s.completed_at) && (
          <span className="ac-times">
            <span>開始</span>
            <span className="tl-num">{s.started_at || '—'}</span>
            <span>完了</span>
            <span className="tl-num">{s.completed_at || '—'}</span>
          </span>
        )}
        {canReport && progress === 'todo' && (
          <button
            type="button"
            className="tl-ghost-btn"
            style={{ '--accent-c': 'var(--pg-active)' } as CSSProperties}
            disabled={busy}
            title="現地で作業を始めたら押す"
            onClick={e => {
              e.stopPropagation()
              onStart(s)
            }}
          >
            {busy ? <Spinner size={16} /> : <Play size={16} />}
            開始
          </button>
        )}
        {canReport && progress === 'active' && (
          <button
            type="button"
            className="tl-ghost-btn"
            style={{ '--accent-c': 'var(--pg-done)' } as CSSProperties}
            disabled={busy}
            title="作業が終わったら押す"
            onClick={e => {
              e.stopPropagation()
              onComplete(s)
            }}
          >
            {busy ? <Spinner size={16} /> : <Check size={16} />}
            完了
          </button>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 4: 実装 `ActionCardView.tsx`**

```tsx
import { useMemo } from 'react'
import type { Schedule, Staff } from '../../types'
import { getShortName } from '../../types'
import { groupByStaff } from '../../utils/timeline/groupByStaff'
import { progressOf } from '../../utils/timeline/progress'
import { isFieldJob, isHoliday } from '../../utils/timeline/workTone'
import { ActionCard } from './ActionCard'
import './ActionCardView.css'

interface Props {
  schedules: Schedule[]
  staff: Staff[]
  /** 人ごとに見出しを付けるか（管理側が全員を見るとき） */
  grouped: boolean
  canReportFor: (s: Schedule) => boolean
  busyId: Schedule['id'] | null
  onOpen: (s: Schedule) => void
  onStart: (s: Schedule) => void
  onComplete: (s: Schedule) => void
}

export function ActionCardView({ schedules, staff, grouped, canReportFor, busyId, onOpen, onStart, onComplete }: Props) {
  // 休暇は上の帯に「休み」として出すので、カードにはしない
  const days = useMemo(() => groupByStaff(schedules.filter(s => !isHoliday(s)), staff), [schedules, staff])

  if (days.length === 0) return <p className="ac-empty">この日の予定はありません</p>

  return (
    <div className="ac-view">
      {days.map(day => {
        const jobs = day.items.filter(isFieldJob)
        const done = jobs.filter(s => progressOf(s) === 'done').length
        return (
          <section key={day.key} className="ac-section">
            {grouped && (
              <h2 className="ac-section-title">
                {getShortName(day.name)}
                <span className="ac-section-count tl-num">{done}/{jobs.length}</span>
              </h2>
            )}
            <div className="ac-list">
              {day.items.map((s, i) => (
                <ActionCard
                  key={s.id}
                  schedule={s}
                  order={i + 1}
                  canReport={canReportFor(s)}
                  busy={busyId === s.id}
                  onOpen={onOpen}
                  onStart={onStart}
                  onComplete={onComplete}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: 実装 `ActionCardView.css`**

```css
.ac-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-right: 3px; /* ホバーで右に 3px 動くので余白を取る */
}

.ac-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.ac-section-count {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}

/* 左→右に進み、幅が足りなければ折り返す。携帯は 1 列で縦に積む */
.ac-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

@media (max-width: 767px) {
  .ac-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

.ac-card {
  --pg: var(--pg-todo);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--pg) 30%, transparent);
  border-left: 4px solid var(--pg);
  background: color-mix(in srgb, var(--pg) 8%, var(--bg-secondary));
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.ac-card:hover,
.ac-card:focus-visible {
  transform: translateX(3px);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--pg) 40%, transparent), 0 0 18px color-mix(in srgb, var(--pg) 28%, transparent);
  outline: none;
}

.ac-done { --pg: var(--pg-done); }
.ac-active {
  --pg: var(--pg-active);
  box-shadow: 0 0 14px color-mix(in srgb, var(--pg-active) 30%, transparent);
}
.ac-cancelled {
  --pg: var(--pg-cancelled);
  opacity: 0.7;
}
.ac-cancelled .ac-title {
  text-decoration: line-through;
}

.ac-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ac-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  font-size: 13px;
  font-weight: 700;
}

.ac-progress-badge {
  color: var(--pg);
  background: color-mix(in srgb, var(--pg) 14%, transparent);
  border-color: color-mix(in srgb, var(--pg) 35%, transparent);
}

.ac-urgent {
  margin-left: auto;
  color: #ffffff;
  background: var(--tl-urgent);
}

.ac-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere; /* 物件名は省略しない */
}

.ac-meta {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 2px 8px;
  margin: 0;
  font-size: 13px;
}

.ac-meta dt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
}

.ac-meta dt svg {
  width: 12px;
  height: 12px;
}

.ac-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.ac-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ac-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

.ac-times {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.ac-foot .tl-ghost-btn {
  margin-left: auto;
}

.ac-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
}
```

- [ ] **Step 6: 通ることを確かめる**

Run: `npx vitest run src/components/action`
Expected: PASS（6 tests）

- [ ] **Step 7: コミット**

```bash
git add src/components/action/ActionCard.tsx src/components/action/ActionCard.test.tsx src/components/action/ActionCardView.tsx src/components/action/ActionCardView.test.tsx src/components/action/ActionCardView.css
git commit --only src/components/action/ActionCard.tsx src/components/action/ActionCard.test.tsx src/components/action/ActionCardView.tsx src/components/action/ActionCardView.test.tsx src/components/action/ActionCardView.css -m "feat: 行動予定の横に進むカード（進み具合の色・開始/完了ボタン）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 管理側のガント `DayGanttView` / `GanttRow` / `TravelOverlay`

**Files:**
- Create: `frontend/src/components/day/DayGanttView.tsx`, `GanttRow.tsx`, `TravelOverlay.tsx`, `DayGanttView.css`
- Test: `frontend/src/components/day/DayGanttView.test.tsx`

横軸 8:00〜20:00（1 時間 96px）、縦軸＝担当。帯の色は種別、点線は目安。帯と帯の間に 1px の線と、線の上に車アイコン＋分（アイコンの両脇は背景色で線を割る）。今日なら「いま」の赤い縦線。帯を押すと予定モーダル（編集）を開く。ドラッグは Phase 1 では作らない。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DayGanttView } from './DayGanttView'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('DayGanttView', () => {
  const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]

  it('担当ごとの行に帯を置き、キャンセルは置かない。帯を押すと開く', () => {
    const onOpen = vi.fn()
    render(
      <DayGanttView
        date="2026-10-16"
        staff={staff}
        focusStaffId={null}
        onOpen={onOpen}
        schedules={[
          makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟' }),
          makeSchedule({ id: 2, staff_id: 1, property_name: '中止棟', status: 'cancelled' }),
          makeSchedule({ id: 3, staff_id: 2, property_name: 'B棟', target_time: '13:00' }),
        ]}
      />,
    )
    expect(screen.getByText('佐藤')).toBeInTheDocument()
    expect(screen.getByText('築地')).toBeInTheDocument()
    expect(screen.queryByText('中止棟')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /B棟/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  })

  it('同じ人の予定の間に移動の目安を出す', () => {
    render(
      <DayGanttView
        date="2026-10-16"
        staff={staff}
        focusStaffId={null}
        onOpen={vi.fn()}
        schedules={[makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: 1, target_time: '13:00' })]}
      />,
    )
    expect(screen.getByText('15分')).toBeInTheDocument()
  })

  it('休暇だけの人は「休み」', () => {
    render(
      <DayGanttView date="2026-10-16" staff={staff} focusStaffId={null} onOpen={vi.fn()} schedules={[makeSchedule({ staff_id: 2, work_type: '休暇' })]} />,
    )
    expect(screen.getByText('休み')).toBeInTheDocument()
  })
})
```

（jsdom には `scrollIntoView` が無いので、実装側で `?.` を付けて呼ぶ）

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/day/DayGanttView.test.tsx`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `TravelOverlay.tsx`**

```tsx
import { Car, Footprints, TrainFront } from 'lucide-react'
import type { TravelGap } from '../../utils/timeline/layoutDay'

const ICON = { car: Car, walk: Footprints, train: TrainFront } as const

interface Props {
  gap: TravelGap
  left: number
  width: number
}

// 帯と帯の間の移動。線は帯の縦の中央、アイコンと分は線の上に重ね、両脇は背景色で線を割る
export function TravelOverlay({ gap, left, width }: Props) {
  const Icon = ICON[gap.travel.mode]
  const label = `${gap.travel.minutes}分`
  return (
    <div className="dg-travel" style={{ left, width }} title={`移動の目安 ${label}（エリア・県別から見積もり）`}>
      <span className="dg-travel-line" />
      {width >= 44 && (
        <span className="dg-travel-label">
          <Icon size={12} />
          <span className="tl-num">{label}</span>
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 実装 `GanttRow.tsx`**

```tsx
import type { Ref } from 'react'
import { Check } from 'lucide-react'
import type { Schedule } from '../../types'
import { getShortName } from '../../types'
import { minToHm } from '../../utils/timeline/dates'
import type { StaffDay } from '../../utils/timeline/groupByStaff'
import { DAY_END_MIN, DAY_START_MIN, type DayLayout } from '../../utils/timeline/layoutDay'
import { targetTimeBadge } from '../../utils/timeline/parseTargetTime'
import { progressOf } from '../../utils/timeline/progress'
import { isFieldJob, workTone } from '../../utils/timeline/workTone'
import { TravelOverlay } from './TravelOverlay'

export interface GanttRowData extends StaffDay {
  layout: DayLayout
  /** 休暇だけの日 */
  offToday: boolean
}

interface Props {
  row: GanttRowData
  /** 分 → 横位置(px) */
  x: (min: number) => number
  /** いまの時刻（今日でなければ null） */
  now: number | null
  focused: boolean
  rowRef?: Ref<HTMLDivElement>
  onOpen: (s: Schedule) => void
}

export function GanttRow({ row, x, now, focused, rowRef, onOpen }: Props) {
  const jobs = row.items.filter(isFieldJob)
  const done = jobs.filter(s => progressOf(s) === 'done').length

  return (
    <div ref={rowRef} className={`dg-row ${focused ? 'is-focused' : ''} ${row.offToday ? 'is-off' : ''}`}>
      <div className="dg-name">
        <span className="dg-name-text">{getShortName(row.name)}</span>
        {row.offToday ? (
          <span className="tl-badge dg-off-badge">休み</span>
        ) : (
          <span className="dg-count tl-num">{done}/{jobs.length}</span>
        )}
      </div>
      <div className="dg-track">
        {row.layout.gaps.map(gap => (
          <TravelOverlay key={`${gap.from}-${gap.to}`} gap={gap} left={x(gap.from)} width={x(gap.to) - x(gap.from)} />
        ))}
        {row.layout.bars.map(bar => {
          const s = bar.schedule
          const progress = progressOf(s)
          const badge = targetTimeBadge(s.target_time)
          const title = [
            `${s.property_name || '（物件名なし）'}（${s.work_type || '種別なし'}）`,
            `${minToHm(bar.from)}〜${minToHm(bar.to)}${bar.basis === 'estimated' ? '（目安）' : ''}`,
            badge ? `指定 ${badge}` : '',
          ]
            .filter(Boolean)
            .join('\n')
          return (
            <button
              key={s.id}
              type="button"
              className={`dg-bar tl-wt-${workTone(s.work_type)} dg-${bar.basis} dg-p-${progress}`}
              style={{ left: x(bar.from), width: Math.max(x(bar.to) - x(bar.from), 24) }}
              title={title}
              onClick={() => onOpen(s)}
            >
              {progress === 'done' && <Check size={12} />}
              <span className="dg-bar-text">{s.property_name || '（物件名なし）'}</span>
            </button>
          )
        })}
        {now !== null && now >= DAY_START_MIN && now <= DAY_END_MIN && (
          <span className="dg-now" style={{ left: x(now) }} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 実装 `DayGanttView.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Schedule, Staff } from '../../types'
import { hmToMin, nowHmJst, todayJst } from '../../utils/timeline/dates'
import { groupByStaff } from '../../utils/timeline/groupByStaff'
import { DAY_END_MIN, DAY_START_MIN, layoutStaffDay } from '../../utils/timeline/layoutDay'
import { isHoliday } from '../../utils/timeline/workTone'
import { GanttRow, type GanttRowData } from './GanttRow'
import './DayGanttView.css'

const PX_PER_MIN = 1.6 // 1 時間 = 96px
const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN / 60 + i)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const x = (min: number) => (clamp(min, DAY_START_MIN, DAY_END_MIN) - DAY_START_MIN) * PX_PER_MIN
const nowMinutes = () => hmToMin(nowHmJst()) ?? 0

interface Props {
  /** その日の予定（行動予定へ移したもの） */
  schedules: Schedule[]
  staff: Staff[]
  date: string
  /** ヒートマップから飛んできたときの担当（その行へスクロールして色を付ける） */
  focusStaffId: number | null
  onOpen: (s: Schedule) => void
}

export function DayGanttView({ schedules, staff, date, focusStaffId, onOpen }: Props) {
  const rows = useMemo<GanttRowData[]>(
    () =>
      groupByStaff(schedules, staff).map(day => ({
        ...day,
        layout: layoutStaffDay(day.items),
        offToday: day.items.length > 0 && day.items.every(isHoliday),
      })),
    [schedules, staff],
  )

  const [now, setNow] = useState(nowMinutes)
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const focusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    focusRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [focusStaffId, date])

  if (rows.length === 0) return <p className="ac-empty">この日の予定はありません</p>

  const width = x(DAY_END_MIN)
  const isToday = date === todayJst()

  return (
    <div className="dg-scroll">
      <div className="dg-grid" style={{ '--dg-width': `${width}px` } as CSSProperties}>
        <div className="dg-corner" />
        <div className="dg-hours">
          {HOURS.map(h => (
            <span key={h} className="dg-hour tl-num" style={{ left: x(h * 60) }}>
              {h}:00
            </span>
          ))}
        </div>
        {rows.map(row => {
          const focused = row.staffId !== null && row.staffId === focusStaffId
          return (
            <GanttRow
              key={row.key}
              row={row}
              x={x}
              now={isToday ? now : null}
              focused={focused}
              rowRef={focused ? focusRef : undefined}
              onOpen={onOpen}
            />
          )
        })}
      </div>
      <p className="dg-legend">実線＝時刻指定・実績　点線＝並び順から置いた目安（1件60分）　線の上＝移動の目安</p>
    </div>
  )
}
```

- [ ] **Step 6: 実装 `DayGanttView.css`**

```css
.dg-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-secondary);
}

.dg-grid {
  display: grid;
  grid-template-columns: 120px var(--dg-width);
  width: max-content;
}

.dg-corner,
.dg-name {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-cell);
}

.dg-corner {
  top: 0;
  z-index: 4;
  background: var(--bg-column-header);
  border-bottom: 1px solid var(--border-cell);
}

.dg-hours {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 32px;
  background: var(--bg-column-header);
  border-bottom: 1px solid var(--border-cell);
}

.dg-hour {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  font-size: 12px;
  color: var(--text-muted);
}

.dg-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 120px var(--dg-width);
  min-height: 56px;
  border-bottom: 1px solid var(--border-cell);
}

.dg-row.is-focused .dg-name,
.dg-row.is-focused .dg-track {
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-secondary));
}

.dg-row.is-off {
  opacity: 0.55;
}

.dg-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.dg-name-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dg-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}

.dg-off-badge {
  height: 22px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
}

.dg-track {
  position: relative;
  background-image: repeating-linear-gradient(to right, var(--border-cell) 0 1px, transparent 1px 96px);
}

.dg-bar {
  position: absolute;
  top: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 8px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: 1px solid var(--wt);
  background: color-mix(in srgb, var(--wt) 16%, var(--bg-secondary));
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.dg-bar:hover {
  z-index: 2;
  transform: translateX(3px);
  box-shadow: 0 0 12px color-mix(in srgb, var(--wt) 40%, transparent);
}

.dg-bar.dg-estimated {
  border-style: dashed;
  background: color-mix(in srgb, var(--wt) 8%, var(--bg-secondary));
}

.dg-bar.dg-p-done {
  border-left: 4px solid var(--pg-done);
}

.dg-bar.dg-p-active {
  border-left: 4px solid var(--pg-active);
  box-shadow: 0 0 10px color-mix(in srgb, var(--pg-active) 35%, transparent);
}

.dg-bar svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--pg-done);
}

/* 帯の幅は時間で決まるので 2 行まで。全文は title（ホバー）と、押して開くモーダルで見る */
.dg-bar-text {
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dg-travel {
  position: absolute;
  top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
}

.dg-travel-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--text-muted);
  opacity: 0.6;
}

.dg-travel-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
}

.dg-travel-label svg {
  width: 12px;
  height: 12px;
}

.dg-now {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 2px;
  background: var(--danger);
  pointer-events: none;
}

.dg-legend {
  position: sticky;
  left: 0;
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 7: 通ることを確かめる**

Run: `npx vitest run src/components/day/DayGanttView.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 8: コミット**

```bash
git add src/components/day/DayGanttView.tsx src/components/day/DayGanttView.test.tsx src/components/day/GanttRow.tsx src/components/day/TravelOverlay.tsx src/components/day/DayGanttView.css
git commit --only src/components/day/DayGanttView.tsx src/components/day/DayGanttView.test.tsx src/components/day/GanttRow.tsx src/components/day/TravelOverlay.tsx src/components/day/DayGanttView.css -m "feat: 管理側の行動予定ガント（担当×時間・移動の目安・いまの線）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 行動予定タブの外枠 `DayScreen`

**Files:**
- Create: `frontend/src/components/day/DayScreen.tsx`, `DayScreen.css`
- Test: `frontend/src/components/day/DayScreen.test.tsx`

役割×画面幅（設計書 §3）:

| | 現地対応者 | 管理側 |
|---|---|---|
| PC | 自分のカード | 全員のガント |
| 携帯 | 自分のカード | 自分のカード（目のアイコンで全員のカード）。スタッフ登録が無い人は最初から全員 |

上の帯: 日付（前日・翌日・今日へ）、「N件中 M件完了」、同行者（自分の予定のとき）、この日の休み。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DayScreen } from './DayScreen'
import { makeSchedule, makeStaff } from '../../test/factories'

const viewport = vi.hoisted(() => ({ isMobile: false }))
vi.mock('../../hooks/useViewport', () => ({ useViewport: () => viewport }))

const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]
const schedules = [
  makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟', co_worker: '築地' }),
  makeSchedule({ id: 2, staff_id: 2, property_name: 'B棟' }),
  makeSchedule({ id: 3, staff_id: 2, property_name: '別の日', date: '2026-10-17' }),
]

const base = {
  schedules,
  staff,
  date: '2026-10-16',
  onDateChange: vi.fn(),
  focusStaffId: null,
  onOpenEdit: vi.fn(),
  onOpenDetail: vi.fn(),
  onUpdateResult: vi.fn(async () => {}),
}

describe('DayScreen', () => {
  beforeEach(() => {
    viewport.isMobile = false
    vi.clearAllMocks()
  })

  it('現地対応者は自分のその日のカードだけ。押すと見るだけで開く', () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    expect(screen.getByText('A棟')).toBeInTheDocument()
    expect(screen.queryByText('B棟')).toBeNull()
    expect(screen.queryByText('別の日')).toBeNull()
    expect(screen.getByText(/同行/)).toHaveTextContent('築地')
    fireEvent.click(screen.getByText('A棟'))
    expect(base.onOpenDetail).toHaveBeenCalled()
  })

  it('開始を押すと「作業中」と今の時刻（HH:MM）で記録する', async () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    await waitFor(() =>
      expect(base.onUpdateResult).toHaveBeenCalledWith(1, '作業中', expect.stringMatching(/^\d{2}:\d{2}$/), null),
    )
  })

  it('管理側の PC はガント', () => {
    render(<DayScreen {...base} role="manager" currentStaffId={null} />)
    expect(screen.getByText(/点線＝並び順から置いた目安/)).toBeInTheDocument()
  })

  it('管理側の携帯は自分のカード、目のアイコンで全員', () => {
    viewport.isMobile = true
    render(<DayScreen {...base} role="manager" currentStaffId={1} />)
    expect(screen.queryByText('B棟')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全員の予定を見る' }))
    expect(screen.getByText('B棟')).toBeInTheDocument()
  })

  it('日付の移動', () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: '次の日' }))
    expect(base.onDateChange).toHaveBeenCalledWith('2026-10-17')
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/day/DayScreen.test.tsx`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `DayScreen.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarOff, ChevronLeft, ChevronRight, Eye, Users } from 'lucide-react'
import type { Schedule, Staff, UserRole } from '../../types'
import { canManageSchedules, getShortName, splitCoWorkers } from '../../types'
import { useViewport } from '../../hooks/useViewport'
import { addDays, nowHmJst, todayJst, weekdayJa } from '../../utils/timeline/dates'
import { progressOf } from '../../utils/timeline/progress'
import { isFieldJob, isHoliday } from '../../utils/timeline/workTone'
import { TimeoutError, withTimeout } from '../../utils/withTimeout'
import { ActionCardView } from '../action/ActionCardView'
import { DayGanttView } from './DayGanttView'
import './DayScreen.css'

type UpdateResult = (
  scheduleId: number | string,
  resultValue: string,
  startedAt?: string | null,
  completedAt?: string | null,
) => Promise<void>

interface Props {
  /** 拠点で絞った、行動予定へ移した予定（is_transferred = 1） */
  schedules: Schedule[]
  staff: Staff[]
  role: UserRole
  currentStaffId: number | null
  date: string
  onDateChange: (date: string) => void
  focusStaffId: number | null
  /** 管理側: 予定モーダル（編集） */
  onOpenEdit: (s: Schedule) => void
  /** 現地対応者: 予定モーダル（見るだけ） */
  onOpenDetail: (s: Schedule) => void
  onUpdateResult: UpdateResult
}

const uniq = (list: string[]) => [...new Set(list.filter(Boolean))]

export function DayScreen({ schedules, staff, role, currentStaffId, date, onDateChange, focusStaffId, onOpenEdit, onOpenDetail, onUpdateResult }: Props) {
  const { isMobile } = useViewport()
  const canManage = canManageSchedules(role)
  const [showAll, setShowAll] = useState(false)
  const [busyId, setBusyId] = useState<Schedule['id'] | null>(null)

  const useGantt = canManage && !isMobile
  // 管理側でもスタッフ登録の無い人（配車担当など）には「自分の予定」が無いので、最初から全員を出す
  const allMode = useGantt || (canManage && (showAll || currentStaffId === null))

  const daySchedules = useMemo(() => schedules.filter(s => s.date === date), [schedules, date])
  const scoped = useMemo(
    () => (allMode ? daySchedules : daySchedules.filter(s => s.staff_id === currentStaffId)),
    [allMode, daySchedules, currentStaffId],
  )

  const jobs = scoped.filter(isFieldJob)
  const doneCount = jobs.filter(s => progressOf(s) === 'done').length
  const holidayNames = uniq(daySchedules.filter(isHoliday).map(s => getShortName(staff.find(st => st.id === s.staff_id)?.name ?? '')))
  const coWorkers = allMode ? [] : uniq(scoped.flatMap(s => splitCoWorkers(s.co_worker, staff)).map(getShortName))

  const canReportFor = (s: Schedule) => canManage || (currentStaffId !== null && s.staff_id === currentStaffId)

  const report = async (s: Schedule, kind: 'start' | 'complete') => {
    setBusyId(s.id)
    try {
      const now = nowHmJst()
      if (kind === 'start') {
        await withTimeout(onUpdateResult(s.id, '作業中', now, null), 15_000, '開始の記録')
      } else {
        await withTimeout(onUpdateResult(s.id, '完了', s.started_at || now, now), 15_000, '完了の記録')
      }
    } catch (e) {
      // 通信の失敗は onUpdateResult（App）がアラートで知らせるので、ここでは時間切れだけ知らせる
      if (e instanceof TimeoutError) alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const isToday = date === todayJst()

  return (
    <div className="tl-root ds-root">
      <div className="ds-bar">
        <div className="ds-date">
          <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => onDateChange(addDays(date, -1))} title="前の日" aria-label="前の日">
            <ChevronLeft size={16} />
          </button>
          <span className="ds-date-label tl-num">
            {Number(date.slice(5, 7))}/{Number(date.slice(8))}（{weekdayJa(date)}）
          </span>
          <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => onDateChange(addDays(date, 1))} title="次の日" aria-label="次の日">
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => onDateChange(todayJst())} title="今日に戻る" aria-label="今日に戻る">
              <CalendarCheck size={16} />
            </button>
          )}
        </div>

        <span className="ds-progress">
          <span className="tl-num">{jobs.length}</span>件中 <span className="tl-num">{doneCount}</span>件完了
        </span>

        {coWorkers.length > 0 && (
          <span className="ds-chip">
            <Users size={16} />
            同行 {coWorkers.join('・')}
          </span>
        )}
        {holidayNames.length > 0 && (
          <span className="ds-chip">
            <CalendarOff size={16} />
            休み {holidayNames.join('・')}
          </span>
        )}

        <span className="ds-spacer" />

        {canManage && isMobile && currentStaffId !== null && (
          <button
            type="button"
            className={`tl-ghost-btn tl-icon-btn ${showAll ? 'is-on' : ''}`}
            aria-pressed={showAll}
            onClick={() => setShowAll(v => !v)}
            title={showAll ? '自分の予定だけにする' : '全員の予定を見る'}
            aria-label="全員の予定を見る"
          >
            <Eye size={16} />
          </button>
        )}
      </div>

      <div className="ds-body">
        {useGantt ? (
          <DayGanttView schedules={daySchedules} staff={staff} date={date} focusStaffId={focusStaffId} onOpen={onOpenEdit} />
        ) : !allMode && currentStaffId === null ? (
          <p className="ac-empty">スタッフ一覧にあなたのメールアドレスが無いため、自分の予定を出せません。開発者に登録を頼んでください。</p>
        ) : (
          <ActionCardView
            schedules={scoped}
            staff={staff}
            grouped={allMode}
            canReportFor={canReportFor}
            busyId={busyId}
            onOpen={canManage ? onOpenEdit : onOpenDetail}
            onStart={s => report(s, 'start')}
            onComplete={s => report(s, 'complete')}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 実装 `DayScreen.css`**

```css
.ds-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.ds-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
}

.ds-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ds-date-label {
  min-width: 92px;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.ds-progress {
  font-size: 14px;
  color: var(--text-secondary);
}

.ds-progress .tl-num {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.ds-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.ds-chip svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ds-spacer {
  flex: 1;
}

.ds-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/components/day`
Expected: PASS（8 tests）

- [ ] **Step 6: コミット**

```bash
git add src/components/day/DayScreen.tsx src/components/day/DayScreen.test.tsx src/components/day/DayScreen.css
git commit --only src/components/day/DayScreen.tsx src/components/day/DayScreen.test.tsx src/components/day/DayScreen.css -m "feat: 行動予定タブの外枠（日付・進み具合・役割と画面幅で表示を振り分け）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 月間の行とセル `monthMatrix.ts`

**Files:**
- Create: `frontend/src/utils/timeline/monthMatrix.ts`
- Test: `frontend/src/utils/timeline/monthMatrix.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { cellKey, heatLevel, indexByCell, monthRows } from './monthMatrix'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('monthRows', () => {
  const days = ['2026-10-01', '2026-10-02']

  it('在籍中の人と、その月に予定がある人をコース順に。担当なしの予定があれば最後に未割当', () => {
    const staff = [
      makeStaff({ id: 1, name: '佐藤 太郎', default_course: '3' }),
      makeStaff({ id: 2, name: '築地 次郎', default_course: '1' }),
      makeStaff({ id: 3, name: '退職 三郎', is_active: 0 }),
      makeStaff({ id: 4, name: '応援 四郎', default_course: '2', is_active: 0 }),
    ]
    const schedules = [makeSchedule({ staff_id: 4, date: '2026-10-02' }), makeSchedule({ staff_id: null, date: '2026-10-01' })]
    expect(monthRows(schedules, staff, days).map(r => r.name)).toEqual(['築地 次郎', '応援 四郎', '佐藤 太郎', '未割当'])
  })
})

describe('indexByCell', () => {
  it('担当×日で引ける', () => {
    const map = indexByCell([makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: null })])
    expect(map.get(cellKey(1, '2026-10-16'))?.map(s => s.id)).toEqual([1])
    expect(map.get(cellKey(null, '2026-10-16'))?.map(s => s.id)).toEqual([2])
  })
})

describe('heatLevel', () => {
  it('0 / 1 / 2 / 3-4 / 5+ の 5 段階', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4])
  })
})
```

（退職 三郎は is_active=0 で予定も無いので出ない。応援 四郎は is_active=0 だがその月に予定があるので出る）

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/monthMatrix.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装**

```ts
import type { Schedule, Staff } from '../../types'
import { courseOf, orderInDay } from './groupByStaff'

export interface MonthRow {
  key: string
  staffId: number | null
  name: string
}

export const cellKey = (staffId: number | null, date: string): string => `${staffId ?? 'none'}|${date}`

/** 月間の行: 在籍中のスタッフ（is_active≠0）＋その月に予定がある人。コース順。担当の無い予定があれば最後に「未割当」 */
export const monthRows = (schedules: Schedule[], staff: Staff[], days: string[]): MonthRow[] => {
  const inMonth = new Set(days)
  const staffIdsWithItems = new Set(schedules.filter(s => inMonth.has(s.date)).map(s => s.staff_id))
  const rows: MonthRow[] = staff
    .filter(st => st.is_active !== 0 || staffIdsWithItems.has(st.id))
    .sort((a, b) => courseOf(a) - courseOf(b) || a.name.localeCompare(b.name, 'ja'))
    .map(st => ({ key: `id-${st.id}`, staffId: st.id, name: st.name }))
  if (staffIdsWithItems.has(null)) rows.push({ key: 'unassigned', staffId: null, name: '未割当' })
  return rows
}

/** 担当×日 → その日の予定（1 日の並び順） */
export const indexByCell = (schedules: Schedule[]): Map<string, Schedule[]> => {
  const map = new Map<string, Schedule[]>()
  for (const s of schedules) {
    const key = cellKey(s.staff_id, s.date)
    const list = map.get(key)
    if (list) list.push(s)
    else map.set(key, [s])
  }
  for (const list of map.values()) list.sort(orderInDay)
  return map
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** ヒートマップの濃さ（空き → 薄青 → 中青 → 濃紺） */
export const heatLevel = (count: number): HeatLevel => {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/monthMatrix.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add src/utils/timeline/monthMatrix.ts src/utils/timeline/monthMatrix.test.ts
git commit --only src/utils/timeline/monthMatrix.ts src/utils/timeline/monthMatrix.test.ts -m "feat: 月間の行（担当）とセル（担当×日）の索引、混み具合の段階

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 月間予定 `MonthView` / `CalendarPane` / `HeatmapPane`

**Files:**
- Create: `frontend/src/components/month/MonthView.tsx`, `CalendarPane.tsx`, `HeatmapPane.tsx`, `MonthView.css`
- Test: `frontend/src/components/month/MonthView.test.tsx`

上の帯: 月（前月・翌月・今月へ）、カレンダー／ヒートマップの切替（アイコン・URL の `?mode=`）、貼り付け登録、予定の追加。
カレンダー: 行＝担当、列＝日。日付の見出しに「行動予定へ移す」アイコン（まだ移していない予定がある日だけ）。予定は種別色の小カード（種別・指定時間の赤字・物件名・号機・作業内容 1 行）。まだ移していない予定は点線の枠。空いた所を押すとその日の予定追加。
ヒートマップ: 同じ行×列で件数の濃さ。押すとその日の内訳、ダブルクリックでその日・その人の行動予定へ。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MonthView } from './MonthView'
import { makeSchedule, makeStaff } from '../../test/factories'
import { todayJst } from '../../utils/timeline/dates'

const month = todayJst().slice(0, 7)
const staff = [makeStaff({ id: 1, name: '佐藤 太郎' })]
const schedules = [
  makeSchedule({ id: 1, staff_id: 1, date: `${month}-05`, property_name: 'A棟', target_time: '10:00' }),
  makeSchedule({ id: 2, staff_id: 1, date: `${month}-05`, property_name: 'B棟', is_transferred: 0 }),
]

const setup = () => {
  const props = {
    schedules,
    staff,
    onOpenAdd: vi.fn(),
    onOpenEdit: vi.fn(),
    onTransfer: vi.fn(async () => {}),
    onOpenPasteImport: vi.fn(),
    onJumpToDay: vi.fn(),
  }
  render(<MonthView {...props} />)
  return props
}

describe('MonthView', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('カレンダー: 予定を押すと編集、空いた所を押すとその日の追加', () => {
    const p = setup()
    fireEvent.click(screen.getByText('A棟'))
    expect(p.onOpenEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    fireEvent.click(screen.getAllByTitle('クリックで予定を追加')[0])
    expect(p.onOpenAdd).toHaveBeenCalledWith(`${month}-01`)
  })

  it('まだ移していない予定がある日だけ「行動予定へ移す」を出し、確認のうえ移す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const p = setup()
    const buttons = screen.getAllByTitle(/行動予定へ移す/)
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(p.onTransfer).toHaveBeenCalledWith(`${month}-05`))
  })

  it('ヒートマップに切り替えると URL に mode が付き、ダブルクリックでその日の行動予定へ', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ヒートマップ' }))
    expect(window.location.search).toContain('mode=heatmap')
    const cell = screen.getByTitle(/佐藤 \d+\/5：2件/)
    expect(within(cell).getByText('2')).toBeInTheDocument()
    fireEvent.doubleClick(cell)
    expect(p.onJumpToDay).toHaveBeenCalledWith(`${month}-05`, 1)
  })

  it('ヒートマップのセルを押すと内訳を出す', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'ヒートマップ' }))
    fireEvent.click(screen.getByTitle(/佐藤 \d+\/5：2件/))
    const pop = screen.getByRole('dialog', { name: 'この日の予定' })
    expect(within(pop).getByText('A棟')).toBeInTheDocument()
    expect(within(pop).getByText('定期')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/month`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `CalendarPane.tsx`**

```tsx
import { Fragment, useMemo } from 'react'
import { ArrowRightToLine } from 'lucide-react'
import type { Schedule } from '../../types'
import { getShortName } from '../../types'
import { weekdayJa, weekdayOf } from '../../utils/timeline/dates'
import { cellKey, type MonthRow } from '../../utils/timeline/monthMatrix'
import { targetTimeBadge } from '../../utils/timeline/parseTargetTime'
import { isHoliday, workTone } from '../../utils/timeline/workTone'
import { Spinner } from '../shared/Spinner'

interface Props {
  days: string[]
  rows: MonthRow[]
  cells: Map<string, Schedule[]>
  today: string
  /** 移している最中の日 */
  transferring: string | null
  onTransfer: (date: string, pending: number) => void
  onOpenAdd: (date: string) => void
  onOpenEdit: (s: Schedule) => void
}

function CalendarChip({ schedule: s, onOpen }: { schedule: Schedule; onOpen: (s: Schedule) => void }) {
  if (isHoliday(s)) {
    return (
      <button type="button" className="cp-chip cp-holiday tl-wt-internal" onClick={() => onOpen(s)}>
        休み
      </button>
    )
  }
  const badge = targetTimeBadge(s.target_time)
  const pending = s.is_transferred !== 1
  return (
    <button
      type="button"
      className={`cp-chip tl-wt-${workTone(s.work_type)} ${pending ? 'is-pending' : ''} ${s.status === 'cancelled' ? 'is-cancelled' : ''}`}
      title={pending ? 'まだ行動予定に移していない予定' : undefined}
      onClick={() => onOpen(s)}
    >
      <span className="cp-chip-top">
        <span className="cp-wt">{s.work_type || '種別なし'}</span>
        {badge && <span className="cp-time">{badge}</span>}
      </span>
      <span className="cp-prop">{s.property_name || '（物件名なし）'}</span>
      {s.unit_number && <span className="cp-unit">{s.unit_number}</span>}
      {s.description && <span className="cp-desc">{s.description}</span>}
    </button>
  )
}

export function CalendarPane({ days, rows, cells, today, transferring, onTransfer, onOpenAdd, onOpenEdit }: Props) {
  const pendingByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const list of cells.values()) {
      for (const s of list) {
        if (s.is_transferred !== 1 && s.status !== 'cancelled') map.set(s.date, (map.get(s.date) ?? 0) + 1)
      }
    }
    return map
  }, [cells])

  return (
    <div className="mv-scroll">
      <div className="mv-grid" style={{ gridTemplateColumns: `120px repeat(${days.length}, 140px)` }}>
        <div className="mv-corner mv-sticky-col mv-sticky-row" />
        {days.map(d => {
          const wd = weekdayOf(d)
          const pending = pendingByDate.get(d) ?? 0
          return (
            <div key={d} className={`mv-dayhead mv-sticky-row ${wd === 0 || wd === 6 ? 'is-weekend' : ''} ${d === today ? 'is-today' : ''}`}>
              <span className="tl-num">{Number(d.slice(8))}</span>
              <span className="mv-wd">{weekdayJa(d)}</span>
              {pending > 0 && (
                <button
                  type="button"
                  className="tl-ghost-btn tl-icon-btn cp-transfer"
                  disabled={transferring === d}
                  onClick={() => onTransfer(d, pending)}
                  title={`この日のまだ移していない ${pending} 件を行動予定へ移す`}
                  aria-label="行動予定へ移す"
                >
                  {transferring === d ? <Spinner size={16} /> : <ArrowRightToLine size={16} />}
                </button>
              )}
            </div>
          )
        })}
        {rows.map(row => (
          <Fragment key={row.key}>
            <div className="mv-name mv-sticky-col">{getShortName(row.name)}</div>
            {days.map(d => {
              const list = cells.get(cellKey(row.staffId, d)) ?? []
              const wd = weekdayOf(d)
              return (
                <div
                  key={d}
                  className={`cp-cell ${wd === 0 || wd === 6 ? 'is-weekend' : ''}`}
                  title={list.length === 0 ? 'クリックで予定を追加' : undefined}
                  onClick={e => {
                    if (e.target === e.currentTarget) onOpenAdd(d)
                  }}
                >
                  {list.map(s => (
                    <CalendarChip key={s.id} schedule={s} onOpen={onOpenEdit} />
                  ))}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 実装 `HeatmapPane.tsx`**

```tsx
import { Fragment, useEffect, useState } from 'react'
import type { Schedule } from '../../types'
import { getShortName } from '../../types'
import { weekdayJa, weekdayOf } from '../../utils/timeline/dates'
import { cellKey, heatLevel, type MonthRow } from '../../utils/timeline/monthMatrix'
import { isFieldJob, isHoliday, workTone } from '../../utils/timeline/workTone'

interface Props {
  days: string[]
  rows: MonthRow[]
  cells: Map<string, Schedule[]>
  today: string
  onJumpToDay: (date: string, staffId: number | null) => void
}

interface Popover {
  date: string
  row: MonthRow
  left: number
  top: number
}

const LEGEND = [
  { level: 0, label: '0' },
  { level: 1, label: '1' },
  { level: 2, label: '2' },
  { level: 3, label: '3-4' },
  { level: 4, label: '5+' },
]

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`

export function HeatmapPane({ days, rows, cells, today, onJumpToDay }: Props) {
  const [pop, setPop] = useState<Popover | null>(null)

  useEffect(() => {
    if (!pop) return
    const close = () => setPop(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.hp-pop, .hp-cell')) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', close, true)
    }
  }, [pop])

  const popItems = pop ? (cells.get(cellKey(pop.row.staffId, pop.date)) ?? []).filter(isFieldJob) : []
  const popTypes = [...popItems.reduce((m, s) => m.set(s.work_type || '種別なし', (m.get(s.work_type || '種別なし') ?? 0) + 1), new Map<string, number>())]

  return (
    <div className="mv-scroll">
      <div className="mv-grid" style={{ gridTemplateColumns: `120px repeat(${days.length}, 36px)` }}>
        <div className="mv-corner mv-sticky-col mv-sticky-row" />
        {days.map(d => {
          const wd = weekdayOf(d)
          return (
            <div key={d} className={`mv-dayhead hp-dayhead mv-sticky-row ${wd === 0 || wd === 6 ? 'is-weekend' : ''} ${d === today ? 'is-today' : ''}`}>
              <span className="tl-num">{Number(d.slice(8))}</span>
              <span className="mv-wd">{weekdayJa(d)}</span>
            </div>
          )
        })}
        {rows.map(row => (
          <Fragment key={row.key}>
            <div className="mv-name mv-sticky-col">{getShortName(row.name)}</div>
            {days.map(d => {
              const list = cells.get(cellKey(row.staffId, d)) ?? []
              const count = list.filter(isFieldJob).length
              const off = count === 0 && list.some(isHoliday)
              const wd = weekdayOf(d)
              return (
                <button
                  key={d}
                  type="button"
                  className={`hp-cell hp-l${heatLevel(count)} ${wd === 0 || wd === 6 ? 'is-weekend' : ''} ${off ? 'is-off' : ''}`}
                  title={`${getShortName(row.name)} ${md(d)}：${count}件（ダブルクリックでこの日の行動予定へ）`}
                  onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setPop({ date: d, row, left: Math.min(r.left, window.innerWidth - 276), top: r.bottom + 4 })
                  }}
                  onDoubleClick={() => {
                    setPop(null)
                    onJumpToDay(d, row.staffId)
                  }}
                >
                  {count > 0 ? count : off ? '休' : ''}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>

      <div className="hp-legend">
        少ない
        {LEGEND.map(l => (
          <span key={l.level} className="hp-legend-item">
            <span className={`hp-legend-swatch hp-l${l.level}`} />
            <span className="tl-num">{l.label}</span>
          </span>
        ))}
        多い
      </div>

      {pop && (
        <div className="hp-pop" role="dialog" aria-label="この日の予定" style={{ left: pop.left, top: Math.min(pop.top, window.innerHeight - 330) }}>
          <h4>
            {getShortName(pop.row.name)}　{md(pop.date)}（{weekdayJa(pop.date)}）
          </h4>
          {popItems.length === 0 ? (
            <p className="hp-pop-hint">予定はありません</p>
          ) : (
            <>
              <div className="hp-pop-types">
                {popTypes.map(([name, n]) => (
                  <span key={name} className={`tl-badge tl-wt-badge tl-wt-${workTone(name)}`}>
                    <span>{name}</span>
                    <span className="tl-num">{n}</span>
                  </span>
                ))}
              </div>
              <ul>
                {popItems.map(s => (
                  <li key={s.id}>
                    {s.property_name || '（物件名なし）'}
                    {s.unit_number ? `　${s.unit_number}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="hp-pop-hint">ダブルクリックで、この日の行動予定を開きます</p>
        </div>
      )}
    </div>
  )
}
```

（内訳バッジの種別名は `<span>` で包む。テストの `getByText('定期')` は要素の文字全体で照合するので、数字と同じ要素に入れると「定期2」になって当たらない）

- [ ] **Step 5: 実装 `MonthView.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Grid3x3, Plus } from 'lucide-react'
import type { Schedule, Staff } from '../../types'
import { addMonths, monthDays, todayJst } from '../../utils/timeline/dates'
import { indexByCell, monthRows } from '../../utils/timeline/monthMatrix'
import { TimeoutError, withTimeout } from '../../utils/withTimeout'
import { CalendarPane } from './CalendarPane'
import { HeatmapPane } from './HeatmapPane'
import './MonthView.css'

export type MonthMode = 'calendar' | 'heatmap'

const readMode = (): MonthMode => (new URLSearchParams(window.location.search).get('mode') === 'heatmap' ? 'heatmap' : 'calendar')

interface Props {
  /** 拠点で絞った全予定（行動予定へ移す前のものも含む） */
  schedules: Schedule[]
  staff: Staff[]
  onOpenAdd: (date: string) => void
  onOpenEdit: (s: Schedule) => void
  onTransfer: (date: string) => Promise<void>
  onOpenPasteImport: () => void
  onJumpToDay: (date: string, staffId: number | null) => void
}

export function MonthView({ schedules, staff, onOpenAdd, onOpenEdit, onTransfer, onOpenPasteImport, onJumpToDay }: Props) {
  const today = todayJst()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [mode, setModeState] = useState<MonthMode>(readMode)
  const [transferring, setTransferring] = useState<string | null>(null)

  // ブックマークできるように URL の ?mode= に残す
  const setMode = (next: MonthMode) => {
    setModeState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('mode', next)
    window.history.replaceState(null, '', url)
  }

  const days = useMemo(() => monthDays(month), [month])
  const rows = useMemo(() => monthRows(schedules, staff, days), [schedules, staff, days])
  const cells = useMemo(() => indexByCell(schedules.filter(s => s.date.startsWith(month))), [schedules, month])

  const transfer = async (date: string, pending: number) => {
    if (!window.confirm(`${date} のまだ移していない予定 ${pending} 件を、行動予定へ移します。よろしいですか？`)) return
    setTransferring(date)
    try {
      await withTimeout(onTransfer(date), 15_000, '行動予定への移行')
    } catch (e) {
      // 通信の失敗は onTransfer（App）がアラートで知らせる
      if (e instanceof TimeoutError) alert(e.message)
    } finally {
      setTransferring(null)
    }
  }

  const [y, m] = month.split('-')

  return (
    <div className="tl-root mv-root">
      <div className="mv-bar">
        <div className="mv-month">
          <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => setMonth(addMonths(month, -1))} title="前の月" aria-label="前の月">
            <ChevronLeft size={16} />
          </button>
          <span className="mv-month-label tl-num">
            {y}年{Number(m)}月
          </span>
          <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => setMonth(addMonths(month, 1))} title="次の月" aria-label="次の月">
            <ChevronRight size={16} />
          </button>
          {month !== today.slice(0, 7) && (
            <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={() => setMonth(today.slice(0, 7))} title="今月に戻る" aria-label="今月に戻る">
              <CalendarCheck size={16} />
            </button>
          )}
        </div>

        <div className="mv-mode" role="group" aria-label="表示の切り替え">
          <button
            type="button"
            className={`tl-ghost-btn tl-icon-btn ${mode === 'calendar' ? 'is-on' : ''}`}
            aria-pressed={mode === 'calendar'}
            onClick={() => setMode('calendar')}
            title="カレンダー（予定の中身を見る）"
            aria-label="カレンダー"
          >
            <CalendarDays size={16} />
          </button>
          <button
            type="button"
            className={`tl-ghost-btn tl-icon-btn ${mode === 'heatmap' ? 'is-on' : ''}`}
            aria-pressed={mode === 'heatmap'}
            onClick={() => setMode('heatmap')}
            title="ヒートマップ（人ごとの混み具合を見る）"
            aria-label="ヒートマップ"
          >
            <Grid3x3 size={16} />
          </button>
        </div>

        <div className="mv-actions">
          <button type="button" className="tl-ghost-btn tl-icon-btn" onClick={onOpenPasteImport} title="スプレッドシートから貼り付けて登録" aria-label="貼り付けて登録">
            <ClipboardPaste size={16} />
          </button>
          <button
            type="button"
            className="tl-ghost-btn tl-icon-btn"
            onClick={() => onOpenAdd(today.startsWith(month) ? today : `${month}-01`)}
            title="予定を追加"
            aria-label="予定を追加"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {mode === 'calendar' ? (
        <CalendarPane
          days={days}
          rows={rows}
          cells={cells}
          today={today}
          transferring={transferring}
          onTransfer={transfer}
          onOpenAdd={onOpenAdd}
          onOpenEdit={onOpenEdit}
        />
      ) : (
        <HeatmapPane days={days} rows={rows} cells={cells} today={today} onJumpToDay={onJumpToDay} />
      )}
    </div>
  )
}
```

- [ ] **Step 6: 実装 `MonthView.css`**

```css
.mv-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.mv-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
}

.mv-month,
.mv-mode,
.mv-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mv-month-label {
  min-width: 110px;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.mv-actions {
  margin-left: auto;
}

.mv-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-secondary);
}

.mv-grid {
  display: grid;
  width: max-content;
}

.mv-sticky-row {
  position: sticky;
  top: 0;
  z-index: 2;
}

.mv-sticky-col {
  position: sticky;
  left: 0;
  z-index: 2;
}

.mv-corner {
  z-index: 3;
  background: var(--bg-column-header);
  border-right: 1px solid var(--border-cell);
  border-bottom: 1px solid var(--border-cell);
}

.mv-dayhead {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 40px;
  background: var(--bg-column-header);
  border-right: 1px solid var(--border-cell);
  border-bottom: 1px solid var(--border-cell);
  font-size: 13px;
}

.mv-dayhead.is-weekend {
  background: color-mix(in srgb, var(--text-muted) 14%, var(--bg-column-header));
}

.mv-dayhead.is-today {
  font-weight: 700;
  box-shadow: inset 0 -3px 0 var(--primary);
}

.hp-dayhead {
  flex-direction: column;
  gap: 0;
  line-height: 1.2;
}

.mv-wd {
  font-size: 12px;
  color: var(--text-muted);
}

.mv-name {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-cell);
  border-bottom: 1px solid var(--border-cell);
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* カレンダー */
.cp-transfer {
  width: 28px;
  height: 28px;
}

.cp-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  padding: 4px 6px 4px 4px; /* 右はホバーの 3px 移動ぶん多めに */
  border-right: 1px solid var(--border-cell);
  border-bottom: 1px solid var(--border-cell);
  cursor: copy;
}

.cp-cell.is-weekend {
  background: color-mix(in srgb, var(--text-muted) 8%, transparent);
}

.cp-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--wt) 35%, transparent);
  border-left: 3px solid var(--wt);
  background: color-mix(in srgb, var(--wt) 8%, var(--bg-secondary));
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.cp-chip:hover {
  transform: translateX(3px);
  box-shadow: 0 0 10px color-mix(in srgb, var(--wt) 35%, transparent);
}

.cp-chip.is-pending {
  border-style: dashed;
  border-left-style: solid;
}

.cp-chip.is-cancelled {
  opacity: 0.55;
  text-decoration: line-through;
}

.cp-chip-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cp-wt {
  color: var(--wt);
  font-weight: 700;
}

.cp-time {
  margin-left: auto;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--tl-urgent);
  color: #ffffff;
  font-family: var(--tl-font-num);
}

.cp-prop {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.cp-unit {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.cp-desc {
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cp-holiday {
  align-items: center;
  color: var(--text-muted);
}

/* ヒートマップ */
.hp-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--border-cell);
  border-bottom: 1px solid var(--border-cell);
  background: var(--heat-0);
  color: var(--text-primary);
  font-family: var(--tl-font-num);
  font-size: 13px;
  cursor: pointer;
}

.hp-l0 { background: var(--heat-0); }
.hp-l1 { background: var(--heat-1); }
.hp-l2 { background: var(--heat-2); }
.hp-l3 { background: var(--heat-3); color: var(--heat-ink-3); }
.hp-l4 { background: var(--heat-4); color: var(--heat-ink-4); }

.hp-cell.hp-l0.is-weekend {
  background: color-mix(in srgb, var(--text-muted) 10%, var(--heat-0));
}

.hp-cell.is-off {
  font-family: var(--tl-font);
  color: var(--text-muted);
}

.hp-cell:hover {
  box-shadow: inset 0 0 0 2px var(--primary);
}

.hp-legend {
  position: sticky;
  left: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.hp-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hp-legend-swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--border-cell);
}

.hp-pop {
  position: fixed;
  z-index: 1000;
  width: 260px;
  max-height: 320px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
}

.hp-pop h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.hp-pop-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.hp-pop ul {
  margin: 0;
  padding-left: 16px;
}

.hp-pop li {
  overflow-wrap: anywhere;
}

.hp-pop-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 7: 通ることを確かめる**

Run: `npx vitest run src/components/month`
Expected: PASS（4 tests）

- [ ] **Step 8: コミット**

```bash
git add src/components/month/MonthView.tsx src/components/month/MonthView.test.tsx src/components/month/CalendarPane.tsx src/components/month/HeatmapPane.tsx src/components/month/MonthView.css
git commit --only src/components/month/MonthView.tsx src/components/month/MonthView.test.tsx src/components/month/CalendarPane.tsx src/components/month/HeatmapPane.tsx src/components/month/MonthView.css -m "feat: 月間予定（カレンダーとヒートマップの切替・行動予定への移行）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 開始・完了の通知を受ける `notification.ts` / `useRealtimeNotifications.ts`

**Files:**
- Create: `frontend/src/utils/timeline/notification.ts`, `frontend/src/hooks/useRealtimeNotifications.ts`
- Test: `frontend/src/utils/timeline/notification.test.ts`, `frontend/src/hooks/useRealtimeNotifications.test.ts`

Realtime の UPDATE には変更前の値が入らない（テーブルの REPLICA IDENTITY が既定のため）。手元の一覧（直前の状態）と比べて「開始」「完了」になった瞬間だけ拾う。App の再取得は 800ms 遅れて走るので、比べる時点では手元はまだ変更前。自分が押したもの（`updated_by` が自分の名前）と、別の拠点の予定は出さない。既読は localStorage `field_app_last_read_notification_at`。

- [ ] **Step 1: 失敗するテストを書く（2 ファイル）**

`notification.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { noticeText, unreadCount, type ProgressNotice } from './notification'

const notice = (o: Partial<ProgressNotice> = {}): ProgressNotice => ({
  id: 'x',
  scheduleId: 1,
  kind: 'start',
  staffName: '佐藤 太郎',
  propertyName: 'B物件',
  workType: '障害',
  at: '10:15',
  receivedAt: 1000,
  ...o,
})

describe('noticeText', () => {
  it('「佐藤さんが B物件（障害）を開始 10:15」の形', () => {
    expect(noticeText(notice())).toBe('佐藤さんが B物件（障害）を開始 10:15')
    expect(noticeText(notice({ kind: 'complete', at: '14:32' }))).toBe('佐藤さんが B物件（障害）を完了 14:32')
    expect(noticeText(notice({ workType: null, at: '' }))).toBe('佐藤さんが B物件を開始')
  })
})

describe('unreadCount', () => {
  it('最後に読んだ時刻より後に届いた数', () => {
    expect(unreadCount([notice({ receivedAt: 1000 }), notice({ receivedAt: 3000 })], 2000)).toBe(1)
  })
})
```

`useRealtimeNotifications.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRealtimeNotifications } from './useRealtimeNotifications'
import { makeSchedule, makeStaff } from '../test/factories'
import { noticeText } from '../utils/timeline/notification'

type Handler = (payload: { new: Record<string, unknown> }) => void
const realtime = vi.hoisted(() => ({ handlers: [] as Handler[] }))

vi.mock('../supabaseClient', () => {
  const channel: Record<string, unknown> = {}
  channel.on = vi.fn((_type: string, _filter: unknown, cb: Handler) => {
    realtime.handlers.push(cb)
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

const sched = makeSchedule({ id: 5, staff_id: 1, property_name: 'B物件', work_type: '障害' })
const options = { enabled: true, branch: 'tokyo' as const, schedules: [sched], staff: [makeStaff()], selfName: '上田 啓' }
const emit = (o: Record<string, unknown>) => act(() => realtime.handlers.at(-1)!({ new: { ...sched, ...o } }))

describe('useRealtimeNotifications', () => {
  beforeEach(() => {
    realtime.handlers.length = 0
    localStorage.clear()
  })

  it('他の人が開始を押したら通知が 1 件届き、未読になる', () => {
    const { result } = renderHook(() => useRealtimeNotifications(options))
    emit({ result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(1)
    expect(noticeText(result.current.latest!)).toBe('佐藤さんが B物件（障害）を開始 10:15')
    expect(result.current.unread).toBe(1)
    act(() => result.current.markAllRead())
    expect(result.current.unread).toBe(0)
  })

  it('自分が押したもの・別の拠点のもの・同じ変化の 2 回目は出さない', () => {
    const { result } = renderHook(() => useRealtimeNotifications(options))
    emit({ result: '作業中', started_at: '10:15', updated_by: '上田 啓' })
    emit({ result: '完了', completed_at: '11:00', updated_by: '佐藤 太郎', notes: '[__branch:osaka__]' })
    emit({ result: '完了', completed_at: '11:00', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(0)
  })

  it('enabled が false なら購読しない', () => {
    renderHook(() => useRealtimeNotifications({ ...options, enabled: false }))
    expect(realtime.handlers).toHaveLength(0)
  })
})
```

（2 つ目のテストの流れ: 自分の開始 → 手元は「対応中」に更新されるが通知しない → 大阪の完了 → 手元は「完了」に更新されるが拠点が違うので通知しない → 同じ完了の 2 回目は変化なしで通知しない）

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/utils/timeline/notification.test.ts src/hooks/useRealtimeNotifications.test.ts`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `notification.ts`**

```ts
import { getShortName } from '../../types'

export interface ProgressNotice {
  id: string
  scheduleId: number
  kind: 'start' | 'complete'
  staffName: string
  propertyName: string
  workType: string | null
  /** 押された時刻 "HH:MM"（分からなければ空） */
  at: string
  /** 画面に届いた時刻（Date.now()） */
  receivedAt: number
}

export const noticeText = (n: ProgressNotice): string => {
  const what = `${n.propertyName || '（物件名なし）'}${n.workType ? `（${n.workType}）` : ''}`
  return `${getShortName(n.staffName)}さんが ${what}を${n.kind === 'start' ? '開始' : '完了'}${n.at ? ` ${n.at}` : ''}`
}

export const unreadCount = (items: ProgressNotice[], lastReadAt: number): number =>
  items.filter(n => n.receivedAt > lastReadAt).length
```

- [ ] **Step 4: 実装 `useRealtimeNotifications.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Branch, Schedule, Staff } from '../types'
import { resolveScheduleBranch } from '../types'
import { detectProgressEvent } from '../utils/timeline/progress'
import { unreadCount, type ProgressNotice } from '../utils/timeline/notification'

const LAST_READ_KEY = 'field_app_last_read_notification_at'
const MAX_ITEMS = 50

const readLastRead = (): number => {
  try {
    return Number(localStorage.getItem(LAST_READ_KEY)) || 0
  } catch {
    return 0
  }
}

interface Options {
  /** 管理側・本番モード・ログイン中のときだけ true */
  enabled: boolean
  branch: Branch
  schedules: Schedule[]
  staff: Staff[]
  /** 自分の名前（updated_by に入る名前）。自分が押したものは通知しない */
  selfName: string
}

export const useRealtimeNotifications = ({ enabled, branch, schedules, staff, selfName }: Options) => {
  const [items, setItems] = useState<ProgressNotice[]>([])
  const [latest, setLatest] = useState<ProgressNotice | null>(null)
  const [lastReadAt, setLastReadAt] = useState<number>(readLastRead)

  // Realtime の UPDATE には変更前の値が入らないので、手元の一覧（直前の状態）と比べる
  const prevRef = useRef(new Map<number, Schedule>())
  useEffect(() => {
    prevRef.current = new Map(schedules.map(s => [Number(s.id), s]))
  }, [schedules])

  const staffRef = useRef(staff)
  useEffect(() => {
    staffRef.current = staff
  }, [staff])

  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('schedules-progress-notify')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedules' }, payload => {
        const next = { ...(payload.new as Partial<Schedule>) } as Schedule
        const id = Number(next.id)
        const event = detectProgressEvent(prevRef.current.get(id), next)
        prevRef.current.set(id, next)
        if (!event) return
        if (resolveScheduleBranch(next) !== branch) return
        if (selfName && next.updated_by === selfName) return

        const member = staffRef.current.find(st => st.id === Number(next.staff_id))
        const notice: ProgressNotice = {
          id: `${id}-${event.kind}-${Date.now()}`,
          scheduleId: id,
          kind: event.kind,
          staffName: member?.name ?? '担当者',
          propertyName: next.property_name,
          workType: next.work_type,
          at: event.at,
          receivedAt: Date.now(),
        }
        setItems(prev => [notice, ...prev].slice(0, MAX_ITEMS))
        setLatest(notice)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, branch, selfName])

  const markAllRead = useCallback(() => {
    const now = Date.now()
    setLastReadAt(now)
    try {
      localStorage.setItem(LAST_READ_KEY, String(now))
    } catch {
      // 保存できなくても画面は動かす（このタブの中では既読になる）
    }
  }, [])

  const dismissLatest = useCallback(() => setLatest(null), [])

  return { items, latest, unread: unreadCount(items, lastReadAt), markAllRead, dismissLatest }
}
```

（未読は `receivedAt > lastReadAt` で数えるので、通知と既読が同じミリ秒でも既読になる）

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/utils/timeline/notification.test.ts src/hooks/useRealtimeNotifications.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: コミット**

```bash
git add src/utils/timeline/notification.ts src/utils/timeline/notification.test.ts src/hooks/useRealtimeNotifications.ts src/hooks/useRealtimeNotifications.test.ts
git commit --only src/utils/timeline/notification.ts src/utils/timeline/notification.test.ts src/hooks/useRealtimeNotifications.ts src/hooks/useRealtimeNotifications.test.ts -m "feat: 現地の開始・完了を Realtime で受けて通知にする

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: 通知の表示 `NotificationToast` / `NotificationBadge`

**Files:**
- Create: `frontend/src/components/shared/NotificationToast.tsx`, `NotificationBadge.tsx`, `Notification.css`
- Test: `frontend/src/components/shared/Notification.test.tsx`

右下に 5 秒だけ出るトースト（押すとその予定を開く）と、ヘッダーのベル（未読数、押すと履歴）。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NotificationBadge } from './NotificationBadge'
import { NotificationToast } from './NotificationToast'
import type { ProgressNotice } from '../../utils/timeline/notification'

const notice: ProgressNotice = {
  id: 'n1',
  scheduleId: 5,
  kind: 'complete',
  staffName: '佐藤 太郎',
  propertyName: 'B物件',
  workType: '障害',
  at: '14:32',
  receivedAt: Date.parse('2026-10-16T05:32:00Z'),
}

describe('NotificationToast', () => {
  afterEach(() => vi.useRealTimers())

  it('押すとその予定を開き、5 秒で消える', () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    render(<NotificationToast notice={notice} onOpen={onOpen} onClose={onClose} />)
    fireEvent.click(screen.getByText('佐藤さんが B物件（障害）を完了 14:32'))
    expect(onOpen).toHaveBeenCalledWith(5)
    onClose.mockClear()
    act(() => vi.advanceTimersByTime(5000))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('通知が無ければ何も出さない', () => {
    const { container } = render(<NotificationToast notice={null} onOpen={vi.fn()} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NotificationBadge', () => {
  it('未読数を出し、開くと既読にして履歴を見せる。履歴を押すと予定を開く', () => {
    const onOpen = vi.fn()
    const onMarkAllRead = vi.fn()
    render(<NotificationBadge items={[notice]} unread={1} onOpen={onOpen} onMarkAllRead={onMarkAllRead} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(onMarkAllRead).toHaveBeenCalled()
    fireEvent.click(screen.getByText('佐藤さんが B物件（障害）を完了 14:32'))
    expect(onOpen).toHaveBeenCalledWith(5)
  })

  it('履歴が無ければその旨', () => {
    render(<NotificationBadge items={[]} unread={0} onOpen={vi.fn()} onMarkAllRead={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(screen.getByText('まだ通知はありません')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run src/components/shared/Notification.test.tsx`
Expected: FAIL（import が解決できない）

- [ ] **Step 3: 実装 `NotificationToast.tsx`**

```tsx
import { useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { noticeText, type ProgressNotice } from '../../utils/timeline/notification'
import './Notification.css'

interface Props {
  notice: ProgressNotice | null
  onOpen: (scheduleId: number) => void
  onClose: () => void
}

// 右下に 5 秒だけ出す。新しい通知が来たら key（notice.id）で作り直して出し直す
export function NotificationToast({ notice, onOpen, onClose }: Props) {
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [notice, onClose])

  if (!notice) return null

  return (
    <div className={`tl-root nt-toast nt-${notice.kind}`} role="status">
      <button
        type="button"
        className="nt-toast-body"
        title="この予定を開く"
        onClick={() => {
          onOpen(notice.scheduleId)
          onClose()
        }}
      >
        <Bell size={16} />
        <span>{noticeText(notice)}</span>
      </button>
      <button type="button" className="nt-icon-btn" onClick={onClose} title="閉じる" aria-label="閉じる">
        <X size={16} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 実装 `NotificationBadge.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { nowHmJst } from '../../utils/timeline/dates'
import { noticeText, type ProgressNotice } from '../../utils/timeline/notification'
import './Notification.css'

interface Props {
  items: ProgressNotice[]
  unread: number
  onOpen: (scheduleId: number) => void
  onMarkAllRead: () => void
}

export function NotificationBadge({ items, unread, onOpen, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) onMarkAllRead()
    setOpen(!open)
  }

  return (
    <div ref={rootRef} className="tl-root nt-badge-root">
      <button type="button" className="btn btn-secondary" onClick={toggle} title="現地の開始・完了の通知" aria-label="通知" aria-expanded={open}>
        <Bell size={16} />
      </button>
      {unread > 0 && <span className="nt-count">{unread > 99 ? '99+' : unread}</span>}
      {open && (
        <div className="nt-drawer" role="dialog" aria-label="通知の履歴">
          {items.length === 0 ? (
            <p className="nt-empty">まだ通知はありません</p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                type="button"
                className={`nt-item nt-${n.kind}`}
                onClick={() => {
                  onOpen(n.scheduleId)
                  setOpen(false)
                }}
              >
                <span className="nt-item-time tl-num">{nowHmJst(new Date(n.receivedAt))}</span>
                <span className="nt-item-text">{noticeText(n)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 実装 `Notification.css`**

```css
.nt-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 6px 6px 6px 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  border-left: 4px solid var(--pg-active);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-lg);
  animation: nt-slide-in 0.25s ease-out;
}

.nt-toast.nt-complete {
  border-left-color: var(--pg-done);
}

@keyframes nt-slide-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.nt-toast-body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.nt-toast-body svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--pg-active);
}

.nt-complete .nt-toast-body svg {
  color: var(--pg-done);
}

.nt-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.nt-icon-btn:hover {
  background: var(--bg-tertiary);
  filter: brightness(1.12);
}

@media (max-width: 767px) {
  .nt-toast {
    left: 16px;
    right: 16px;
    bottom: 16px;
  }
}

.nt-badge-root {
  position: relative;
}

.nt-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  box-sizing: border-box;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger);
  color: #ffffff;
  font-family: var(--tl-font-num);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
}

.nt-drawer {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1500;
  width: 340px;
  max-height: 420px;
  overflow: auto;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-lg);
}

.nt-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.nt-item:hover {
  background: var(--bg-card-hover);
}

.nt-item-time {
  color: var(--text-muted);
  text-align: center;
}

.nt-item-text {
  overflow-wrap: anywhere;
}

.nt-empty {
  margin: 12px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 6: 通ることを確かめる**

Run: `npx vitest run src/components/shared/Notification.test.tsx`
Expected: PASS（4 tests）

- [ ] **Step 7: コミット**

```bash
git add src/components/shared/NotificationToast.tsx src/components/shared/NotificationBadge.tsx src/components/shared/Notification.css src/components/shared/Notification.test.tsx
git commit --only src/components/shared/NotificationToast.tsx src/components/shared/NotificationBadge.tsx src/components/shared/Notification.css src/components/shared/Notification.test.tsx -m "feat: 通知のトーストとヘッダーのベル（未読数・履歴）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: App に組み込む

**Files:**
- Modify: `frontend/src/App.tsx`

新しいタブ「行動予定」（既定）と「月間予定」（管理側）を足す。旧タブ 3 つは管理側が History アイコンで出したときだけ。現地対応者は「行動予定」だけ。通知のベルとトースト。予定モーダルの「見るだけ」。

- [ ] **Step 1: import を足す**

```ts
import { Calendar, Layers, RefreshCw, AlertCircle, List, Settings, Sun, Moon, BarChart3, HelpCircle, ZoomIn, ZoomOut } from 'lucide-react';
```
↓
```ts
import { Calendar, CalendarDays, Layers, ListChecks, History, RefreshCw, AlertCircle, List, Settings, Sun, Moon, BarChart3, HelpCircle, ZoomIn, ZoomOut } from 'lucide-react';
```

`import { fetchAllRows } from './utils/fetchAllRows';`（Task 7 で足した行）の次に足す:

```ts
import { DayScreen } from './components/day/DayScreen';
import { MonthView } from './components/month/MonthView';
import { NotificationToast } from './components/shared/NotificationToast';
import { NotificationBadge } from './components/shared/NotificationBadge';
import { useRealtimeNotifications } from './hooks/useRealtimeNotifications';
import { todayJst } from './utils/timeline/dates';
import './styles/timeline.css';
```

- [ ] **Step 2: タブの型と既定値**

```ts
function App() {
  const [activeTab, setActiveTab] = useState<'grid' | 'timeline' | 'calendar' | 'master_management' | 'analytics'>('grid');
```
↓
```ts
// action=行動予定（新）/ month=月間予定（新）/ grid・timeline・calendar=旧画面（Phase 2 で削除）
type AppTab = 'action' | 'month' | 'grid' | 'timeline' | 'calendar' | 'master_management' | 'analytics';
const LEGACY_TABS: AppTab[] = ['grid', 'timeline', 'calendar'];

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('action');
```

- [ ] **Step 3: 旧画面の出し入れ・行動予定の日付の状態を足す**

```ts
  const [currentStaffId, setCurrentStaffId] = useState<number | null>(null);
```
↓
```ts
  const [currentStaffId, setCurrentStaffId] = useState<number | null>(null);

  // 旧画面（表の予定表・当日行動予定表・月間予定表）のタブを出すか。管理側だけ。新画面で 2 週間問題なければ Phase 2 で消す
  const [legacyUi, setLegacyUi] = useState<boolean>(() => {
    try {
      return localStorage.getItem('field_app_legacy_ui') === 'true';
    } catch {
      return false;
    }
  });
  const toggleLegacyUi = () => {
    const next = !legacyUi;
    setLegacyUi(next);
    try {
      localStorage.setItem('field_app_legacy_ui', String(next));
    } catch {
      // 保存できなくても切り替えはする
    }
  };

  // 行動予定タブの日付と、ヒートマップから飛んできたときの担当
  const [dayDate, setDayDate] = useState<string>(() => todayJst());
  const [dayFocusStaffId, setDayFocusStaffId] = useState<number | null>(null);
```

- [ ] **Step 4: 役割によるタブの制限を置き換える**

```ts
  useEffect(() => {
    if (
      (currentUserRole !== 'developer' && activeTab === 'master_management') ||
      (!canManageSchedules(currentUserRole) && (activeTab === 'calendar' || activeTab === 'analytics'))
    ) {
      setActiveTab('grid');
    }
  }, [currentUserRole, activeTab]);
```
↓
```ts
  useEffect(() => {
    // 現地対応者は「行動予定」だけ（他のタブは出さない）
    if (!canManageSchedules(currentUserRole)) {
      if (activeTab !== 'action') setActiveTab('action');
      return;
    }
    if (
      (currentUserRole !== 'developer' && activeTab === 'master_management') ||
      (!legacyUi && LEGACY_TABS.includes(activeTab))
    ) {
      setActiveTab('action');
    }
  }, [currentUserRole, activeTab, legacyUi]);
```

- [ ] **Step 5: 予定モーダルの「見るだけ」の状態を足す**

```ts
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
```
↓
```ts
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  // 現地対応者がカードから開いたときは見るだけ
  const [modalReadOnly, setModalReadOnly] = useState(false);
```

- [ ] **Step 6: モーダルを開く関数を直し、見るだけ・通知を足す**

```ts
  const handleOpenAddModal = (dateStr: string) => {
    setSelectedSchedule(null);
    setSelectedDate(dateStr);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(schedule.date);
    setIsModalOpen(true);
  };
```
↓
```ts
  const handleOpenAddModal = (dateStr: string) => {
    setSelectedSchedule(null);
    setSelectedDate(dateStr);
    setModalReadOnly(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(schedule.date);
    setModalReadOnly(false);
    setIsModalOpen(true);
  };

  const handleOpenDetailModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(schedule.date);
    setModalReadOnly(true);
    setIsModalOpen(true);
  };

  // 現地の開始・完了の通知（管理側・本番モードのときだけ）。自分の名前は updated_by に入る名前と同じ決め方にする
  const selfEditorName = user
    ? user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      staff.find(st => st.email?.toLowerCase().trim() === (user.email || '').toLowerCase().trim())?.name ||
      user.email ||
      'system'
    : '';
  const notifications = useRealtimeNotifications({
    enabled: Boolean(user) && !isSandboxMode && canManageSchedules(currentUserRole),
    branch: currentBranch,
    schedules,
    staff,
    selfName: selfEditorName,
  });
  const handleOpenNotice = (scheduleId: number) => {
    const target = schedules.find(s => Number(s.id) === scheduleId);
    if (target) handleOpenEditModal(target);
  };
```

- [ ] **Step 7: タブを置き換える**

```tsx
            <div className="nav-tabs">
              <button
                className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
                onClick={() => setActiveTab('grid')}
              >
                <List size={16} />
                予定表 (グリッド)
              </button>
              <button
                className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                onClick={() => setActiveTab('timeline')}
              >
                <Layers size={16} />
                当日行動予定表
              </button>
              {canManageSchedules(currentUserRole) && (
                <button
                  className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('calendar')}
                >
                  <Calendar size={16} />
                  月間予定表
                </button>
              )}
            </div>
```
↓
```tsx
            <div className="nav-tabs">
              <button
                className={`tab-btn ${activeTab === 'action' ? 'active' : ''}`}
                onClick={() => setActiveTab('action')}
              >
                <ListChecks size={16} />
                行動予定
              </button>
              {canManageSchedules(currentUserRole) && (
                <button
                  className={`tab-btn ${activeTab === 'month' ? 'active' : ''}`}
                  onClick={() => setActiveTab('month')}
                >
                  <CalendarDays size={16} />
                  月間予定
                </button>
              )}
              {canManageSchedules(currentUserRole) && legacyUi && (
                <>
                  <button
                    className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
                    onClick={() => setActiveTab('grid')}
                  >
                    <List size={16} />
                    旧 予定表
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                    onClick={() => setActiveTab('timeline')}
                  >
                    <Layers size={16} />
                    旧 当日行動予定表
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('calendar')}
                  >
                    <Calendar size={16} />
                    旧 月間予定表
                  </button>
                </>
              )}
            </div>
```

- [ ] **Step 8: ヘッダーにベルと旧画面ボタンを足す**

```tsx
              {/* グループ2: 業務・マスタ管理 */}
```
↓
```tsx
              {/* グループ2: 業務・マスタ管理 */}
              {canManageSchedules(currentUserRole) && (
                <NotificationBadge
                  items={notifications.items}
                  unread={notifications.unread}
                  onOpen={handleOpenNotice}
                  onMarkAllRead={notifications.markAllRead}
                />
              )}
              {canManageSchedules(currentUserRole) && (
                <button
                  type="button"
                  className={`btn ${legacyUi ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={toggleLegacyUi}
                  aria-pressed={legacyUi}
                  title={legacyUi ? '旧画面のタブを隠す' : '旧画面（表の予定表・当日行動予定表・月間予定表）のタブを出す'}
                >
                  <History size={16} />
                </button>
              )}
```

- [ ] **Step 9: 新しい画面を描く**

```tsx
                {activeTab === 'grid' && (
                  <GridView
```
↓
```tsx
                {activeTab === 'action' && (
                  <DayScreen
                    schedules={branchSchedules.filter(s => s.is_transferred === 1)}
                    staff={branchStaff}
                    role={currentUserRole}
                    currentStaffId={currentStaffId}
                    date={dayDate}
                    onDateChange={(d) => {
                      setDayDate(d);
                      setDayFocusStaffId(null);
                    }}
                    focusStaffId={dayFocusStaffId}
                    onOpenEdit={handleOpenEditModal}
                    onOpenDetail={handleOpenDetailModal}
                    onUpdateResult={handleUpdateScheduleResult}
                  />
                )}
                {canManageSchedules(currentUserRole) && activeTab === 'month' && (
                  <MonthView
                    schedules={branchSchedules}
                    staff={branchStaff}
                    onOpenAdd={handleOpenAddModal}
                    onOpenEdit={handleOpenEditModal}
                    onTransfer={handleTransferSchedules}
                    onOpenPasteImport={() => setIsImportOpen(true)}
                    onJumpToDay={(d, staffId) => {
                      setDayDate(d);
                      setDayFocusStaffId(staffId);
                      setActiveTab('action');
                    }}
                  />
                )}
                {activeTab === 'grid' && (
                  <GridView
```

- [ ] **Step 10: 予定モーダルに渡す**

```tsx
            defaultTransferred={activeTab === 'calendar' ? 0 : 1}
            lockedBy={selectedSchedule && typeof selectedSchedule.id === 'number' ? activeLocks[selectedSchedule.id] : null}
```
↓（月間から追加した予定は「まだ行動予定に移していない」で作る）
```tsx
            defaultTransferred={activeTab === 'calendar' || activeTab === 'month' ? 0 : 1}
            lockedBy={selectedSchedule && typeof selectedSchedule.id === 'number' ? activeLocks[selectedSchedule.id] : null}
            readOnly={modalReadOnly}
```

- [ ] **Step 11: トーストを置く**

```tsx
          <HelpGuideModal
```
↓
```tsx
          <NotificationToast
            key={notifications.latest?.id ?? 'none'}
            notice={notifications.latest}
            onOpen={handleOpenNotice}
            onClose={notifications.dismissLatest}
          />

          <HelpGuideModal
```

- [ ] **Step 12: 全テストとビルド**

Run: `npm test`
Expected: すべて PASS（約 70 tests）

Run: `npm run build`
Expected: エラーなし

Run: `npx eslint src/App.tsx src/components/action src/components/day src/components/month src/components/shared/Notification*.tsx src/hooks src/utils/timeline src/utils/withTimeout.ts src/utils/fetchAllRows.ts`
Expected: 新しく書いた所にエラーなし（App.tsx に元からある警告は、この変更で増えていなければよい。`git stash` は使わず、比べたいときは `git worktree add ../fsm-base origin/main` で別フォルダに出して `npx eslint src/App.tsx` の件数を比べる）

- [ ] **Step 13: コミット**

```bash
git add src/App.tsx
git commit --only src/App.tsx -m "feat: 新しい行動予定・月間予定のタブと通知を組み込み、旧画面は管理側の切替に

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: 画面での確認・変更履歴・PR の用意

**Files:**
- Modify: `walkthrough.md`（リポジトリ直下）

- [ ] **Step 1: dev サーバーを立てる**

Run（バックグラウンド）: `npm run dev -- --port 5183 --strictPort`
Expected: `http://localhost:5183/` で起動

- [ ] **Step 2: お試しモードで確かめる（本番の DB には書かない）**

ブラウザ（Claude in Chrome）で `http://localhost:5183/` を開き、デモログインのあと**まずヘッダーの「🧪 お試しモード」を押す**。次を確かめ、それぞれ画面写真を撮る。

1. 「開発者権限でデモログイン」→ 行動予定: ガントに担当の行と帯、点線（目安）と実線（時刻指定）、帯の間に車アイコン＋分、今日なら赤い縦線。帯を押すと予定モーダル（編集できる）
2. 同じく 月間予定: カレンダーに種別色の小カード、まだ移していない予定は点線。日付見出しの → アイコンで移行（確認が出る）。ヒートマップに切替 → URL に `?mode=heatmap`。セルを押すと内訳、ダブルクリックで行動予定のその日・その人の行に飛ぶ
3. 「一般作業者でデモログイン」（神崎さん）→ タブは「行動予定」だけ。自分のカードだけが左から並ぶ。「開始」→ 対応中（青）、「完了」→ 完了（緑）と時刻。カードを押すとモーダルが見るだけ（保存・削除が無い、「閉じる」）
4. 開発者デモで、ブラウザの幅を 390px にする → カードが 1 列、目のアイコンで全員のカード。ページに横スクロールが出ないこと（`document.documentElement.scrollWidth <= innerWidth` を JS で確かめる）
5. History アイコンで旧タブが出て、旧画面がこれまでどおり動く。もう一度押すと消える
6. ダークテーマに切り替えて、文字・バッジ・ヒートマップの濃さが読めること
7. 全要素がカード・枠の内側に収まっていること（物件名が長い予定で確認）

確認が済んだらお試しモードを終了する（お試し中の変更は捨てられる）。

- [ ] **Step 3: 通知（Realtime）の確認 — 上田さんの了承を取ってから**

本番の更新が要るので、上田さんに「本番に試験用の予定を 1 件作って開始・完了を押し、確認後に消してよいか」を聞く。了承が出たら:
1. タブ A: 開発者デモ（お試しモードは切る）で行動予定を開いておく
2. 月間予定で今日の日付に予定を 1 件追加（物件名「試験_通知確認」、担当は自分以外のスタッフ）→ 行動予定へ移す
3. タブ B: Microsoft ログインの別アカウント、または開発者デモで同じ予定を開き、モーダルではなく**旧 当日行動予定表の結果欄**で「作業中」→「完了」にする（`updated_by` がタブ A と違う名前になる操作）
4. タブ A の右下にトーストが出て、ベルに未読数が付くこと。トーストを押すとその予定が開くこと
5. 確認後、試験の予定を削除し、監査ログ以外に残っていないことを確かめる

了承が出なければこの Step は飛ばし、PR の本文に「Realtime 通知は単体テストのみ。本番での確認は未実施」と書く。

- [ ] **Step 4: 変更履歴を書く（Decision 2026-10-16: 担当・日時・方法・コミット）**

`walkthrough.md` の末尾に、既存の書き方に合わせて足す（日時は `git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M'` の値、コミットは `git log --oneline origin/main..HEAD` の範囲）:

```markdown
## 行動予定・月間予定のタイムライン刷新（Phase 1）

- **担当**: 上田（Claude Code で実装）
- **日時**: <最後のコミットの日時>（main へはまだ入れていない）
- **方法**: ブランチ `feature/timeline-redesign` で作業し、PR で富本さんの確認を取る
- **コミット**: <最初のハッシュ>〜<最後のハッシュ>

### 背景
表計算風の予定表・当日行動予定表・月間予定表をやめ、現地対応者にはカード、管理側にはガントと月間のカレンダー／ヒートマップを出す。設計書 `docs/superpowers/specs/2026-10-16-timeline-redesign-design.md`

### 修正内容
- 新しいタブ「行動予定」「月間予定」。旧画面は管理側だけヘッダーの時計まわりアイコンで出し入れ
- 現地対応者: 自分のカード（開始・完了ボタン）。管理側の PC: 担当×時間のガント（移動の目安つき）。携帯: カード
- 現地の開始・完了を管理側の画面に通知（右下のトースト・ヘッダーのベル）
- 予定の取得を 1000 件ずつ全件取る形に（PostgREST の上限対策）
- テスト環境（Vitest）を導入

### 挙動が変わる点
- ログイン後の最初のタブが「行動予定」になる。現地対応者は他のタブが出なくなる
- 現地対応者がカードから開く予定モーダルは見るだけ（保存・削除できない）

### 検証結果
- `npm test`: <件数> 件すべて成功、`npm run build` 成功
- お試しモードで 開発者／一般作業者／携帯幅 を画面確認（Task 19 Step 2 の 1〜7）
- Realtime 通知: <確認した／未実施>
```

- [ ] **Step 5: コミット**

```bash
cd ..
git add walkthrough.md
git commit --only walkthrough.md -m "docs: タイムライン刷新の変更履歴を追記（担当・日時・方法つき）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: PR の用意（push は上田さんに確認してから）**

上田さんに「`feature/timeline-redesign` を GitHub に push して、富本さん宛ての PR を作ってよいか」を確認する。了承後:

```bash
git push -u origin feature/timeline-redesign
gh pr create --base main --head feature/timeline-redesign --title "行動予定・月間予定のタイムライン刷新（Phase 1）" --body "<walkthrough.md に書いた内容＋画面写真＋『書体を BIZ UDPゴシックにしたのは新画面の中だけ。アプリ全体をどうするか相談したい』>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**main へのマージはしない**（富本さんの承認後）。
