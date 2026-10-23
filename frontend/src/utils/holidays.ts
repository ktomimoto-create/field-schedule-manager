// 日本の祝日を計算して Set<string>（'YYYY-MM-DD'）で返す（原本: construction-chart src/utils/holidays.ts）。
// テンプレート化にあたって次の2点を足した:
// - 春分・秋分の日を年ごとの表ではなく近似式で求める（2099 年まで有効）。表のままだと 2029 年以降が抜ける
// - 国民の休日（前日と翌日が祝日の平日。例: 2026-09-22）を入れる

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`

/** n 番目の特定曜日（weekday: 0=日, 1=月 ...） */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  let count = 0
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month - 1, d)
    if (date.getMonth() !== month - 1) break
    if (date.getDay() === weekday && ++count === n) return fmt(year, month, d)
  }
  return ''
}

/** 春分・秋分の日（1980〜2099 年の近似式） */
function equinoxDay(year: number, base: number): number {
  const y = year - 1980
  return Math.floor(base + 0.242194 * y - Math.floor(y / 4))
}

function buildHolidaysForYear(year: number): Set<string> {
  const set = new Set<string>([
    fmt(year, 1, 1),                           // 元日
    nthWeekday(year, 1, 1, 2),                 // 成人の日: 1月第2月曜
    fmt(year, 2, 11),                          // 建国記念の日
    fmt(year, 2, 23),                          // 天皇誕生日
    fmt(year, 3, equinoxDay(year, 20.8431)),   // 春分の日
    fmt(year, 4, 29),                          // 昭和の日
    fmt(year, 5, 3),                           // 憲法記念日
    fmt(year, 5, 4),                           // みどりの日
    fmt(year, 5, 5),                           // こどもの日
    nthWeekday(year, 7, 1, 3),                 // 海の日: 7月第3月曜
    fmt(year, 8, 11),                          // 山の日
    nthWeekday(year, 9, 1, 3),                 // 敬老の日: 9月第3月曜
    fmt(year, 9, equinoxDay(year, 23.2488)),   // 秋分の日
    nthWeekday(year, 10, 1, 2),                // スポーツの日: 10月第2月曜
    fmt(year, 11, 3),                          // 文化の日
    fmt(year, 11, 23),                         // 勤労感謝の日
  ].filter(Boolean))

  const dateOf = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y ?? year, (m ?? 1) - 1, d ?? 1)
  }
  const key = (d: Date) => fmt(d.getFullYear(), d.getMonth() + 1, d.getDate())

  // 国民の休日: 前日と翌日が祝日に挟まれた平日
  for (const h of [...set]) {
    const mid = dateOf(h)
    mid.setDate(mid.getDate() + 1)
    const next = new Date(mid)
    next.setDate(next.getDate() + 1)
    if (mid.getDay() !== 0 && !set.has(key(mid)) && set.has(key(next))) set.add(key(mid))
  }

  // 振替休日: 祝日が日曜のとき、その後で最初の祝日でない日
  for (const h of [...set].sort()) {
    const d = dateOf(h)
    if (d.getDay() !== 0) continue
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    while (set.has(key(next))) next.setDate(next.getDate() + 1)
    set.add(key(next))
  }

  return set
}

const cache = new Map<number, Set<string>>()

/** viewStart〜viewEnd（'YYYY-MM-DD'）の年を含む祝日の集合 */
export function getHolidaySet(viewStart: string, viewEnd: string): Set<string> {
  const startYear = Number.parseInt(viewStart.slice(0, 4), 10)
  const endYear = Number.parseInt(viewEnd.slice(0, 4), 10)
  const result = new Set<string>()
  for (let y = startYear; y <= endYear; y++) {
    let s = cache.get(y)
    if (!s) {
      s = buildHolidaysForYear(y)
      cache.set(y, s)
    }
    for (const h of s) result.add(h)
  }
  return result
}
