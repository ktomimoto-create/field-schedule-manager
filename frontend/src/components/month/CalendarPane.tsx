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
