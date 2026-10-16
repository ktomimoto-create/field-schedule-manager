import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionCardView } from './ActionCardView'
import { makeSchedule, makeStaff } from '../../test/factories'

const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]
const props = { staff, canReportFor: () => true, isBusy: () => false, onOpen: vi.fn(), onStart: vi.fn(), onComplete: vi.fn(), onReport: vi.fn() }

describe('ActionCardView', () => {
  it('全員を見るときは人ごとに見出し（完了数/件数）を付け、休暇はカードにしない', () => {
    render(
      <ActionCardView
        {...props}
        grouped
        schedules={[
          makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟', result: '完了' }),
          makeSchedule({ id: 2, staff_id: 2, property_name: 'B棟' }),
          makeSchedule({ id: 3, staff_id: 2, work_type: '休暇', property_name: '休み' }),
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: /佐藤/ })).toHaveTextContent('1/1')
    expect(screen.getByRole('heading', { name: /築地/ })).toHaveTextContent('0/1')
    expect(screen.queryByText('休み')).toBeNull()
  })

  it('予定が無ければその旨を出す', () => {
    render(<ActionCardView {...props} grouped={false} schedules={[]} />)
    expect(screen.getByText('この日の予定はありません')).toBeInTheDocument()
  })
})
