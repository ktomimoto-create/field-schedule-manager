import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MonthView } from './MonthView'
import { makeSchedule, makeStaff } from '../../test/factories'
import { todayJst } from '../../utils/timeline/dates'

const month = todayJst().slice(0, 7)
const staff = [makeStaff({ id: 1, name: '佐藤 太郎' })]
const schedules = [
  makeSchedule({ id: 1, staff_id: 1, date: `${month}-05`, property_name: 'A棟', target_time: '10:00' }),
  makeSchedule({ id: 2, staff_id: 1, date: `${month}-05`, property_name: 'B棟', is_transferred: 0 }),
]

const setup = () => {
  const props = {
    schedules,
    staff,
    onOpenAdd: vi.fn(),
    onOpenEdit: vi.fn(),
    onTransfer: vi.fn(async () => {}),
    onOpenPasteImport: vi.fn(),
    onJumpToDay: vi.fn(),
  }
  render(<MonthView {...props} />)
  return props
}

describe('MonthView', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('カレンダー: 予定を押すと編集、空いた所を押すとその日の追加', () => {
    const p = setup()
    fireEvent.click(screen.getByText('A棟'))
    expect(p.onOpenEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    fireEvent.click(screen.getAllByTitle('クリックで予定を追加')[0])
    expect(p.onOpenAdd).toHaveBeenCalledWith(`${month}-01`)
  })

  it('まだ移していない予定がある日だけ「行動予定へ移す」を出し、確認のうえ移す', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const p = setup()
    const buttons = screen.getAllByTitle(/行動予定へ移す/)
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(p.onTransfer).toHaveBeenCalledWith(`${month}-05`))
  })

  it('ヒートマップに切り替えると URL に mode が付き、ダブルクリックでその日の行動予定へ', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ヒートマップ' }))
    expect(window.location.search).toContain('mode=heatmap')
    const cell = screen.getByTitle(/佐藤 \d+\/5：2件/)
    expect(within(cell).getByText('2')).toBeInTheDocument()
    fireEvent.doubleClick(cell)
    expect(p.onJumpToDay).toHaveBeenCalledWith(`${month}-05`, 1)
  })

  it('ヒートマップのセルを押すと内訳を出す', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'ヒートマップ' }))
    fireEvent.click(screen.getByTitle(/佐藤 \d+\/5：2件/))
    const pop = screen.getByRole('dialog', { name: 'この日の予定' })
    expect(within(pop).getByText('A棟')).toBeInTheDocument()
    expect(within(pop).getByText('定期')).toBeInTheDocument()
  })
})
