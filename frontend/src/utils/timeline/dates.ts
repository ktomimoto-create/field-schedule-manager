// 日付・時刻はすべて日本時間で扱う。
// （new Date().toISOString() は UTC なので、朝 9 時前は前日の日付になる）
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// 出力形式（ロケール依存）に頼らず formatToParts から組み立てる
const jstParts = (now: Date): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(now)) out[p.type] = p.value
  return out
}

/** 今日の日付 "YYYY-MM-DD"（日本時間） */
export const todayJst = (now: Date = new Date()): string => {
  const p = jstParts(now)
  return `${p.year}-${p.month}-${p.day}`
}

/** いまの時刻 "HH:MM"（日本時間・24 時間制）。started_at / completed_at の保存形式と同じ */
export const nowHmJst = (now: Date = new Date()): string => {
  const p = jstParts(now)
  return `${p.hour}:${p.minute}`
}

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
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// 時刻文字列は 2 形式ある（nowHmJst は "09:05"、minToHm / normalizeTargetTime は "9:30"）。比較は文字列でなく hmToMin の分でする
export const minToHm = (min: number): string => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
