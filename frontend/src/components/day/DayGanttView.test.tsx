import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DayGanttView } from './DayGanttView'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('DayGanttView', () => {
  const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]

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

  it('休暇だけの人は「休み」', () => {
    render(
      <DayGanttView date="2026-10-16" staff={staff} focusStaffId={null} onOpen={vi.fn()} schedules={[makeSchedule({ staff_id: 2, work_type: '休暇' })]} />,
    )
    expect(screen.getByText('休み')).toBeInTheDocument()
  })
})
