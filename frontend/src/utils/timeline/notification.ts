import { getShortName } from '../../types'

export interface ProgressNotice {
  id: string
  scheduleId: number
  kind: 'start' | 'complete'
  staffName: string
  propertyName: string
  workType: string | null
  /** 押された時刻 "HH:MM"（分からなければ空） */
  at: string
  /** 画面に届いた時刻（Date.now()） */
  receivedAt: number
}

export const noticeText = (n: ProgressNotice): string => {
  const what = `${n.propertyName || '（物件名なし）'}${n.workType ? `（${n.workType}）` : ''}`
  return `${getShortName(n.staffName)}さんが ${what}を${n.kind === 'start' ? '開始' : '完了'}${n.at ? ` ${n.at}` : ''}`
}

export const unreadCount = (items: ProgressNotice[], lastReadAt: number): number =>
  items.filter(n => n.receivedAt > lastReadAt).length
