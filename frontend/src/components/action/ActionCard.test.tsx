import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActionCard } from './ActionCard'
import { makeSchedule } from '../../test/factories'

const renderCard = (overrides: Parameters<typeof makeSchedule>[0], canReport = true) => {
  const handlers = { onOpen: vi.fn(), onStart: vi.fn(), onComplete: vi.fn() }
  render(<ActionCard schedule={makeSchedule(overrides)} order={1} canReport={canReport} busy={false} {...handlers} />)
  return handlers
}

describe('ActionCard', () => {
  it('未着手: 物件名・種別・指定時間・開始ボタン。開始を押してもカードは開かない', () => {
    const h = renderCard({ property_name: 'B物件', work_type: '障害', target_time: '10:00', unit_number: '1号機' })
    expect(screen.getByText('B物件')).toBeInTheDocument()
    expect(screen.getByText('障害')).toBeInTheDocument()
    expect(screen.getByText('未着手')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('1号機')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    expect(h.onStart).toHaveBeenCalledTimes(1)
    expect(h.onOpen).not.toHaveBeenCalled()
  })

  it('対応中: 完了ボタン', () => {
    const h = renderCard({ result: '作業中', started_at: '10:05' })
    expect(screen.getByText('対応中')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /完了/ }))
    expect(h.onComplete).toHaveBeenCalledTimes(1)
  })

  it('完了: ボタンは出さず開始・完了の時刻を出す', () => {
    renderCard({ result: '完了', started_at: '10:05', completed_at: '10:40' })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('10:05')).toBeInTheDocument()
    expect(screen.getByText('10:40')).toBeInTheDocument()
  })

  it('報告できない人にはボタンを出さない。カードを押すと開く', () => {
    const h = renderCard({}, false)
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByText('物件A'))
    expect(h.onOpen).toHaveBeenCalledTimes(1)
  })
})
