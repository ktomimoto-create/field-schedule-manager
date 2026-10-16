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
    <div
      ref={rowRef}
      className={`dg-row ${focused ? 'is-focused' : ''} ${row.offToday ? 'is-off' : ''}`}
      style={{ minHeight: 56 + (row.layout.laneCount - 1) * 40 }}
    >
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
          // 範囲外の帯は右端からはみ出さないよう寄せる
          const barWidth = Math.max(x(bar.to) - x(bar.from), 24)
          const barLeft = Math.min(x(bar.from), x(DAY_END_MIN) - barWidth)
          const title = [
            `${s.property_name || '（物件名なし）'}（${s.work_type || '種別なし'}）`,
            `${minToHm(bar.from)}〜${minToHm(bar.to)}${bar.basis === 'estimated' ? '（目安）' : ''}`,
            badge ? `指定 ${badge}` : '',
            bar.late ? `締切 ${badge} に間に合わない並び` : '',
          ]
            .filter(Boolean)
            .join('\n')
          return (
            <button
              key={s.id}
              type="button"
              className={`dg-bar tl-wt-${workTone(s.work_type)} dg-${bar.basis} dg-p-${progress} ${bar.late ? 'dg-late' : ''}`}
              style={{ left: barLeft, width: barWidth, top: 10 + bar.lane * 40 }}
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
