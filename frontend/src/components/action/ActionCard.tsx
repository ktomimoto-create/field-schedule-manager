import type { CSSProperties } from 'react'
import { Box, Check, Clock, FilePen, Hash, MapPin, Play, TriangleAlert } from 'lucide-react'
import type { Schedule } from '../../types'
import { PROGRESS_LABEL, progressOf } from '../../utils/timeline/progress'
import { targetTimeBadge } from '../../utils/timeline/parseTargetTime'
import { workTone } from '../../utils/timeline/workTone'
import { Spinner } from '../shared/Spinner'

interface Props {
  schedule: Schedule
  /** その人の何件目か */
  order: number
  /** 開始・完了を押せるか（本人の予定、または管理側） */
  canReport: boolean
  busy: boolean
  onOpen: (s: Schedule) => void
  onStart: (s: Schedule) => void
  onComplete: (s: Schedule) => void
  /** 結果の報告・直し（報告モーダルを開く） */
  onReport: (s: Schedule) => void
}

const placeOf = (s: Schedule): string => {
  const pref = s.prefecture === '23' ? '23区' : s.prefecture
  return [s.area, pref].filter(Boolean).join(' / ')
}

export function ActionCard({ schedule: s, order, canReport, busy, onOpen, onStart, onComplete, onReport }: Props) {
  const progress = progressOf(s)
  const badge = targetTimeBadge(s.target_time)
  const place = placeOf(s)

  return (
    <article
      className={`ac-card ac-${progress} tl-wt-${workTone(s.work_type)}`}
      tabIndex={0}
      aria-label={`${s.property_name || '物件名なし'} の詳細を開く`}
      onClick={() => onOpen(s)}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          onOpen(s)
        }
      }}
    >
      <div className="ac-head">
        <span className="ac-order tl-num">{order}</span>
        <span className="tl-badge tl-wt-badge">{s.work_type || '種別なし'}</span>
        <span className="tl-badge ac-progress-badge">{PROGRESS_LABEL[progress]}</span>
        {badge && (
          <span className="tl-badge ac-urgent" title="指定時間">
            <Clock size={12} />
            {badge}
          </span>
        )}
      </div>

      <h3 className="ac-title">{s.property_name || '（物件名なし）'}</h3>

      <dl className="ac-meta">
        {s.unit_number && (
          <>
            <dt><Hash size={12} />号機</dt>
            <dd>{s.unit_number}</dd>
          </>
        )}
        {s.box && (
          <>
            <dt><Box size={12} />BOX</dt>
            <dd>{s.box}</dd>
          </>
        )}
        {place && (
          <>
            <dt><MapPin size={12} />場所</dt>
            <dd>{place}</dd>
          </>
        )}
        {s.disorder_type && (
          <>
            <dt><TriangleAlert size={12} />障害</dt>
            <dd>{s.disorder_type}</dd>
          </>
        )}
      </dl>

      {s.description && <p className="ac-desc">{s.description}</p>}

      <div className="ac-foot">
        {(s.started_at || s.completed_at) && (
          <span className="ac-times">
            <span>開始</span>
            <span className="tl-num">{s.started_at || '—'}</span>
            <span>完了</span>
            <span className="tl-num">{s.completed_at || '—'}</span>
          </span>
        )}
        {canReport && progress === 'todo' && (
          <button
            type="button"
            className="tl-ghost-btn"
            style={{ '--accent-c': 'var(--pg-active)' } as CSSProperties}
            disabled={busy}
            title="現地で作業を始めたら押す"
            onClick={e => {
              e.stopPropagation()
              onStart(s)
            }}
          >
            {busy ? <Spinner size={16} /> : <Play size={16} />}
            開始
          </button>
        )}
        {canReport && progress === 'active' && (
          <button
            type="button"
            className="tl-ghost-btn"
            style={{ '--accent-c': 'var(--pg-done)' } as CSSProperties}
            disabled={busy}
            title="作業が終わったら押す"
            onClick={e => {
              e.stopPropagation()
              onComplete(s)
            }}
          >
            {busy ? <Spinner size={16} /> : <Check size={16} />}
            完了
          </button>
        )}
        {canReport && (
          <button
            type="button"
            className="tl-ghost-btn tl-icon-btn"
            title="結果を報告・直す"
            aria-label="結果を報告・直す"
            onClick={e => {
              e.stopPropagation()
              onReport(s)
            }}
          >
            <FilePen size={16} />
          </button>
        )}
      </div>
    </article>
  )
}
