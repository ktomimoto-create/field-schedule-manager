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
  isBusy: (s: Schedule) => boolean
  onOpen: (s: Schedule) => void
  onStart: (s: Schedule) => void
  onComplete: (s: Schedule) => void
}

export function ActionCardView({ schedules, staff, grouped, canReportFor, isBusy, onOpen, onStart, onComplete }: Props) {
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
                  busy={isBusy(s)}
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
