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
            {getShortName(pop.row.name)}
            {'　'}
            {md(pop.date)}（{weekdayJa(pop.date)}）
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
                    {s.unit_number ? '　' + s.unit_number : ''}
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
