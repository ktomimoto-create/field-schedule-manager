import type { Schedule } from '../../types'
import { progressOf } from './progress'

// 種別 → 色の系統。カード・ガント・月間・ヒートマップで同じ色を使う（色の対応を全体で一貫させる）。
// 実際の色は styles/timeline.css の --wt-* で決める。
export type WorkTone = 'teiki' | 'shogai' | 'koji' | 'hoshu' | 'internal' | 'other'

const TONE_BY_WORK_TYPE: Record<string, WorkTone> = {
  定期: 'teiki',
  障害: 'shogai',
  '2次': 'shogai',
  障害対応: 'shogai',
  工事: 'koji',
  設置: 'koji',
  保守: 'hoshu',
  休暇: 'internal',
  社内: 'internal',
  ミーティング: 'internal',
  研修: 'internal',
  面談: 'internal',
}

export const workTone = (workType: string | null | undefined): WorkTone =>
  TONE_BY_WORK_TYPE[(workType || '').trim()] ?? 'other'

export const isHoliday = (s: Pick<Schedule, 'work_type'>): boolean => (s.work_type || '').trim() === '休暇'

/** 現地の作業として件数・進み具合に数えるか（キャンセルと社内の予定は数えない） */
export const isFieldJob = (s: Pick<Schedule, 'status' | 'result' | 'work_type'>): boolean =>
  progressOf(s) !== 'cancelled' && workTone(s.work_type) !== 'internal'
