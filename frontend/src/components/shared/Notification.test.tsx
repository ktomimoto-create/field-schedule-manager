import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NotificationBadge } from './NotificationBadge'
import { NotificationToast } from './NotificationToast'
import type { ProgressNotice } from '../../utils/timeline/notification'

const notice: ProgressNotice = {
  id: 'n1',
  scheduleId: 5,
  kind: 'complete',
  staffName: '佐藤 太郎',
  propertyName: 'B物件',
  workType: '障害',
  at: '14:32',
  receivedAt: Date.parse('2026-10-16T05:32:00Z'),
}

describe('NotificationToast', () => {
  afterEach(() => vi.useRealTimers())

  it('押すとその予定を開き、5 秒で消える', () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    render(<NotificationToast notice={notice} onOpen={onOpen} onClose={onClose} />)
    fireEvent.click(screen.getByText('佐藤さんが B物件（障害）を完了 14:32'))
    expect(onOpen).toHaveBeenCalledWith(5)
    onClose.mockClear()
    act(() => vi.advanceTimersByTime(5000))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('通知が無ければ何も出さない', () => {
    const { container } = render(<NotificationToast notice={null} onOpen={vi.fn()} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NotificationBadge', () => {
  it('未読数を出し、開くと既読にして履歴を見せる。履歴を押すと予定を開く', () => {
    const onOpen = vi.fn()
    const onMarkAllRead = vi.fn()
    render(<NotificationBadge items={[notice]} unread={1} onOpen={onOpen} onMarkAllRead={onMarkAllRead} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(onMarkAllRead).toHaveBeenCalled()
    fireEvent.click(screen.getByText('佐藤さんが B物件（障害）を完了 14:32'))
    expect(onOpen).toHaveBeenCalledWith(5)
  })

  it('履歴が無ければその旨', () => {
    render(<NotificationBadge items={[]} unread={0} onOpen={vi.fn()} onMarkAllRead={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(screen.getByText('まだ通知はありません')).toBeInTheDocument()
  })
})
