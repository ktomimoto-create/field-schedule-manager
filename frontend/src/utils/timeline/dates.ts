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
