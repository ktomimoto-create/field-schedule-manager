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
  /** 表示（カレンダー / ヒートマップ）。渡したときは画面の中の切替ボタンを出さない */
  mode?: MonthMode
}

export function MonthView({ schedules, staff, onOpenAdd, onOpenEdit, onTransfer, onOpenPasteImport, onJumpToDay, mode: modeProp }: Props) {
  const today = todayJst()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [ownMode, setModeState] = useState<MonthMode>(readMode)
  const mode = modeProp ?? ownMode
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
  const cells = useMemo(() => indexByCell(schedules.filter(s => s.date.startsWith(month)), staff), [schedules, staff, month])

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

        {!modeProp && (
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
        )}

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
