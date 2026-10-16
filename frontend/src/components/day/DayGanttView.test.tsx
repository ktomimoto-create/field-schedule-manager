import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DayGanttView } from './DayGanttView'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('DayGanttView', () => {
  const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]

  beforeEach(() => {
    // 時計は Date だけ止める
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('担当ごとの行に帯を置き、キャンセルは置かない。帯を押すと開く', () => {
    const onOpen = vi.fn()
    render(
      <DayGanttView
        date="2026-10-16"
        staff={staff}
        focusStaffId={null}
        onOpen={onOpen}
        schedules={[
          makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟' }),
          makeSchedule({ id: 2, staff_id: 1, property_name: '中止棟', status: 'cancelled' }),
          makeSchedule({ id: 3, staff_id: 2, property_name: 'B棟', target_time: '13:00' }),
        ]}
      />,
    )
    expect(screen.getByText('佐藤')).toBeInTheDocument()
    expect(screen.getByText('築地')).toBeInTheDocument()
    expect(screen.queryByText('中止棟')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /B棟/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  })

  it('同じ人の予定の間に移動の目安を出す', () => {
    render(
      <DayGanttView
        date="2026-10-16"
        staff={staff}
        focusStaffId={null}
        onOpen={vi.fn()}
        schedules={[makeSchedule({ id: 1, staff_id: 1, target_time: '10:00' }), makeSchedule({ id: 2, staff_id: 1, target_time: '13:00' })]}
      />,
    )
    expect(screen.getByText('15分')).toBeInTheDocument()
  })

  it('狭い隙間（15 分）はアイコンだけで、分の文字は出さない', () => {
    render(
      <DayGanttView
        date="2026-10-16"
        staff={staff}
        focusStaffId={null}
        onOpen={vi.fn()}
        schedules={[makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: 1 })]}
      />,
    )
    const travel = screen.getByTitle(/15分/)
    expect(within(travel).queryByText('15分')).toBeNull()
    expect(travel.querySelector('svg')).not.toBeNull()
  })

  it('休暇だけの人は「休み」', () => {
    render(
      <DayGanttView date="2026-10-16" staff={staff} focusStaffId={null} onOpen={vi.fn()} schedules={[makeSchedule({ staff_id: 2, work_type: '休暇' })]} />,
    )
    expect(screen.getByText('休み')).toBeInTheDocument()
  })

  it('同じ内容の予定配列で再描画しても、飛んだ先の行へのスクロールは1回だけ', () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const make = () => [makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 3, staff_id: 2, target_time: '13:00' })]
      const { rerender } = render(<DayGanttView date="2026-10-16" staff={staff} focusStaffId={2} onOpen={vi.fn()} schedules={make()} />)
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      rerender(<DayGanttView date="2026-10-16" staff={staff} focusStaffId={2} onOpen={vi.fn()} schedules={make()} />)
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
