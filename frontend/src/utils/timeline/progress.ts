import type { Schedule } from '../../types'

export type Progress = 'done' | 'active' | 'todo' | 'cancelled'

export const PROGRESS_LABEL: Record<Progress, string> = {
  done: '完了',
  active: '対応中',
  todo: '未着手',
  cancelled: 'キャンセル',
}

type ProgressFields = Pick<Schedule, 'status' | 'result'> & Partial<Pick<Schedule, 'started_at' | 'completed_at'>>

export const progressOf = (s: ProgressFields): Progress => {
  if (s.status === 'cancelled') return 'cancelled'
  if (s.result === '完了' || s.completed_at) return 'done'
  if (s.result === '作業中' || s.started_at) return 'active'
  return 'todo'
}

/** 変更前後を比べて「開始」「完了」になった瞬間だけを拾う（通知用） */
export const detectProgressEvent = (
  prev: ProgressFields | undefined,
  next: ProgressFields,
): { kind: 'start' | 'complete'; at: string } | null => {
  if (!prev) return null
  const before = progressOf(prev)
  const after = progressOf(next)
  if (before === after) return null
  if (after === 'done') return { kind: 'complete', at: next.completed_at ?? '' }
  if (after === 'active' && before === 'todo') return { kind: 'start', at: next.started_at ?? '' }
  return null
}
