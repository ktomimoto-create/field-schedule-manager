import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ArrowRightToLine } from 'lucide-react'
import type { Schedule } from '../../types'
import { getShortName } from '../../types'
import { weekdayJa, weekdayOf } from '../../utils/timeline/dates'
import { cellKey, type MonthRow } from '../../utils/timeline/monthMatrix'
import { progressOf } from '../../utils/timeline/progress'
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

interface Hover {
  schedule: Schedule
  rect: { top: number; left: number; right: number }
}

interface ChipProps {
  schedule: Schedule
  onOpen: (s: Schedule) => void
  onHover: (h: Hover | null) => void
}

/** 吹き出しに出す項目（空のものは出さない） */
const DETAIL_FIELDS: { label: string; value: (s: Schedule) => string | null | undefined }[] = [
  { label: '作業内容', value: s => s.description },
  { label: '指定時間', value: s => s.target_time },
  { label: '同行者', value: s => s.co_worker },
  { label: '移動手段', value: s => s.transport },
  { label: 'エリア', value: s => [s.prefecture, s.area].filter(Boolean).join(' ') },
  { label: '依頼番号', value: s => s.request_number },
  { label: '障害区分', value: s => s.disorder_type },
  { label: '備考', value: s => s.notes },
]

function CalendarChip({ schedule: s, onOpen, onHover }: ChipProps) {
  const hoverProps = {
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      onHover({ schedule: s, rect: { top: r.top, left: r.left, right: r.right } })
    },
    onMouseLeave: () => onHover(null),
  }
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
      className={`cp-chip tl-wt-${workTone(s.work_type)} ${pending ? 'is-pending' : ''} ${progressOf(s) === 'cancelled' ? 'is-cancelled' : ''}`}
      onClick={() => onOpen(s)}
      {...hoverProps}
    >
      {/* 1 行に種別・物件名・時刻。号機や作業内容は乗せたときの吹き出しで見る */}
      <span className="cp-wt">{s.work_type || '種別なし'}</span>
      <span className="cp-prop">{s.property_name || '（物件名なし）'}</span>
      {badge && <span className="cp-time">{badge}</span>}
    </button>
  )
}

function DetailPopover({ hover }: { hover: Hover }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const s = hover.schedule

  // 幅と高さを測って、右に収まらなければカードの左に出す。上下は画面内に収める
  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const r = hover.rect
    const right = r.right + 8
    const left = right + width <= window.innerWidth - 8 ? right : Math.max(8, r.left - 8 - width)
    const top = Math.max(8, Math.min(r.top, window.innerHeight - height - 8))
    setPos({ left, top })
  }, [hover])

  const badge = targetTimeBadge(s.target_time)
  const details = DETAIL_FIELDS.map(f => ({ label: f.label, value: f.value(s) })).filter(f => f.value)
  return (
    <div
      ref={ref}
      className={`cp-pop tl-wt-${workTone(s.work_type)}`}
      role="tooltip"
      style={{ left: pos?.left ?? hover.rect.right + 8, top: pos?.top ?? hover.rect.top, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="cp-pop-head">
        <span className="tl-badge tl-wt-badge">{s.work_type || '種別なし'}</span>
        {badge && <span className="cp-time cp-pop-time">{badge}</span>}
        {s.is_transferred !== 1 && <span className="cp-pop-note">行動予定へ未移行</span>}
      </div>
      <div className="cp-pop-title">
        <span className="cp-pop-prop">{s.property_name || '（物件名なし）'}</span>
        {s.unit_number && <span className="cp-pop-unit tl-num">{s.unit_number}</span>}
      </div>
      {details.length > 0 && (
        <dl className="cp-pop-list">
          {details.map(d => (
            <Fragment key={d.label}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  )
}

export function CalendarPane({ days, rows, cells, today, transferring, onTransfer, onOpenAdd, onOpenEdit }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)
  const timer = useRef<number | undefined>(undefined)

  // カードを素通りしただけで出ないよう、少し待ってから出す
  const onHover = (h: Hover | null) => {
    window.clearTimeout(timer.current)
    if (!h) {
      setHover(null)
      return
    }
    timer.current = window.setTimeout(() => setHover(h), 250)
  }

  useEffect(() => {
    if (!hover) return
    const close = () => setHover(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [hover])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const pendingByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const list of cells.values()) {
      for (const s of list) {
        // App が移す対象と同じ（キャンセルも含む）
        if (s.is_transferred !== 1) map.set(s.date, (map.get(s.date) ?? 0) + 1)
      }
    }
    return map
  }, [cells])

  return (
    <div className="mv-scroll">
      <div className="mv-grid" style={{ gridTemplateColumns: `120px repeat(${days.length}, 240px)` }}>
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
                  aria-label={`行動予定へ移す（${pending}件）`}
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
                    <CalendarChip key={s.id} schedule={s} onOpen={onOpenEdit} onHover={onHover} />
                  ))}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      {hover && <DetailPopover hover={hover} />}
    </div>
  )
}
