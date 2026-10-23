import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarOff, ChevronLeft, ChevronRight, Eye, Users } from 'lucide-react'
import type { Schedule, Staff, UserRole } from '../../types'
import { canManageSchedules, getShortName, splitCoWorkers } from '../../types'
import { useViewport } from '../../hooks/useViewport'
import { addDays, nowHmJst, todayJst, weekdayJa } from '../../utils/timeline/dates'
import { progressOf } from '../../utils/timeline/progress'
import { isFieldJob, isHoliday } from '../../utils/timeline/workTone'
import { ActionCardView } from '../action/ActionCardView'
import { ReportModal } from '../ReportModal'
import { DayGanttView } from './DayGanttView'
import type { FeEvent } from '../../utils/feEvents'
import './DayScreen.css'

type UpdateResult = (
  scheduleId: number | string,
  resultValue: string,
  startedAt?: string | null,
  completedAt?: string | null,
  reportNotes?: string | null,
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
  /** FE のボタン記録（ガントの出動に使う） */
  feEvents?: FeEvent[]
}

const uniq = (list: string[]) => [...new Set(list.filter(Boolean))]

export function DayScreen({ schedules, staff, role, currentStaffId, date, onDateChange, focusStaffId, onOpenEdit, onOpenDetail, onUpdateResult, feEvents }: Props) {
  const { isMobile } = useViewport()
  const canManage = canManageSchedules(role)
  const [showAll, setShowAll] = useState(false)
  // 送信中の予定（押した順に重なっても、互いの状態を消さない）
  const [reportTarget, setReportTarget] = useState<Schedule | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

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
    const id = String(s.id)
    if (busyIds.has(id)) return
    setBusyIds(prev => new Set(prev).add(id))
    try {
      const now = nowHmJst()
      if (kind === 'start') {
        await onUpdateResult(s.id, '作業中', now, null)
      } else {
        await onUpdateResult(s.id, '完了', s.started_at || now, now)
      }
    } catch {
      // 時間切れを含む失敗は onUpdateResult（App）がアラートで知らせ済み。ここでは握りつぶして busy だけ戻す
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
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
          <DayGanttView schedules={daySchedules} staff={staff} date={date} focusStaffId={focusStaffId} onOpen={onOpenEdit} feEvents={feEvents} />
        ) : !allMode && currentStaffId === null ? (
          <p className="ac-empty">スタッフ一覧にあなたのメールアドレスが無いため、自分の予定を出せません。開発者に登録を頼んでください。</p>
        ) : (
          <ActionCardView
            schedules={scoped}
            staff={staff}
            grouped={allMode}
            canReportFor={canReportFor}
            isBusy={s => busyIds.has(String(s.id))}
            onOpen={canManage ? onOpenEdit : onOpenDetail}
            onStart={s => report(s, 'start')}
            onComplete={s => report(s, 'complete')}
            onReport={setReportTarget}
          />
        )}
      </div>

      {reportTarget && (
        <ReportModal
          isOpen
          schedule={reportTarget}
          onClose={() => setReportTarget(null)}
          onSave={onUpdateResult}
        />
      )}
    </div>
  )
}
