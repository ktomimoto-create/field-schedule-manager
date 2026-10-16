import { describe, expect, it } from 'vitest'
import { noticeText, unreadCount, type ProgressNotice } from './notification'

const notice = (o: Partial<ProgressNotice> = {}): ProgressNotice => ({
  id: 'x',
  scheduleId: 1,
  kind: 'start',
  staffName: '佐藤 太郎',
  propertyName: 'B物件',
  workType: '障害',
  at: '10:15',
  receivedAt: 1000,
  ...o,
})

describe('noticeText', () => {
  it('「佐藤さんが B物件（障害）を開始 10:15」の形', () => {
    expect(noticeText(notice())).toBe('佐藤さんが B物件（障害）を開始 10:15')
    expect(noticeText(notice({ kind: 'complete', at: '14:32' }))).toBe('佐藤さんが B物件（障害）を完了 14:32')
    expect(noticeText(notice({ workType: null, at: '' }))).toBe('佐藤さんが B物件を開始')
  })
})

describe('unreadCount', () => {
  it('最後に読んだ時刻より後に届いた数', () => {
    expect(unreadCount([notice({ receivedAt: 1000 }), notice({ receivedAt: 3000 })], 2000)).toBe(1)
  })
})
