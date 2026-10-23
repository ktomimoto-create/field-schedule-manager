import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DayScreen } from './DayScreen'
import { makeSchedule, makeStaff } from '../../test/factories'

const viewport = vi.hoisted(() => ({ isMobile: false }))
vi.mock('../../hooks/useViewport', () => ({ useViewport: () => viewport }))

const staff = [makeStaff({ id: 1, name: '佐藤 太郎' }), makeStaff({ id: 2, name: '築地 次郎', default_course: '2' })]
const schedules = [
  makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟', co_worker: '築地' }),
  makeSchedule({ id: 2, staff_id: 2, property_name: 'B棟' }),
  makeSchedule({ id: 3, staff_id: 2, property_name: '別の日', date: '2026-10-17' }),
]

const base = {
  schedules,
  staff,
  date: '2026-10-16',
  onDateChange: vi.fn(),
  focusStaffId: null,
  onOpenEdit: vi.fn(),
  onOpenDetail: vi.fn(),
  onUpdateResult: vi.fn(async () => {}),
}

describe('DayScreen', () => {
  beforeEach(() => {
    viewport.isMobile = false
    vi.clearAllMocks()
    // 時計は Date だけ止める（waitFor のタイマーは生かす）
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T01:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('現地対応者は自分のその日のカードだけ。押すと見るだけで開く', () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    expect(screen.getByText('A棟')).toBeInTheDocument()
    expect(screen.queryByText('B棟')).toBeNull()
    expect(screen.queryByText('別の日')).toBeNull()
    expect(screen.getByText(/同行/)).toHaveTextContent('築地')
    fireEvent.click(screen.getByText('A棟'))
    expect(base.onOpenDetail).toHaveBeenCalled()
  })

  it('開始を押すと「作業中」と今の時刻（HH:MM）で記録する', async () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    await waitFor(() =>
      expect(base.onUpdateResult).toHaveBeenCalledWith(1, '作業中', expect.stringMatching(/^\d{2}:\d{2}$/), null),
    )
  })

  it('作業中のカードの完了を押すと、開始時刻を引き継いで「完了」と今の時刻で記録する', async () => {
    const working = [makeSchedule({ id: 1, staff_id: 1, property_name: 'A棟', result: '作業中', started_at: '10:05' })]
    render(<DayScreen {...base} schedules={working} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /完了/ }))
    await waitFor(() =>
      expect(base.onUpdateResult).toHaveBeenCalledWith(1, '完了', '10:05', expect.stringMatching(/^\d{2}:\d{2}$/)),
    )
  })

  it('失敗しても（時間切れ含め）DayScreen は握りつぶし、ボタンは押せる状態に戻る', async () => {
    const failing = vi.fn(async () => {
      throw new Error('結果の更新に失敗しました。')
    })
    render(<DayScreen {...base} onUpdateResult={failing} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /開始/ }))
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: /開始/ })).not.toBeDisabled())
  })

  it('報告ボタンで報告モーダルが開き（カードは開かない）、保存すると結果と時刻とメモを渡す', async () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: '結果を報告・直す' }))
    expect(screen.getByText('作業対応の報告')).toBeInTheDocument()
    expect(base.onOpenDetail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '作業中' }))
    fireEvent.change(screen.getByPlaceholderText(/現地での対応結果/), { target: { value: '鍵が無かった' } })
    fireEvent.click(screen.getByRole('button', { name: '報告を保存' }))
    await waitFor(() =>
      expect(base.onUpdateResult).toHaveBeenCalledWith(1, '作業中', expect.stringMatching(/^\d{2}:\d{2}$/), null, '鍵が無かった'),
    )
    await waitFor(() => expect(screen.queryByText('作業対応の報告')).toBeNull())
  })

  it('スタッフ一覧に自分が無い現地対応者には、理由を出す', () => {
    render(<DayScreen {...base} role="staff" currentStaffId={null} />)
    expect(screen.getByText(/スタッフ一覧にあなたのメールアドレスが無いため/)).toBeInTheDocument()
    expect(screen.queryByText('A棟')).toBeNull()
  })

  it('スタッフ登録の無い管理側の携帯は、最初から全員のカードを出し、目のアイコンは出さない', () => {
    viewport.isMobile = true
    render(<DayScreen {...base} role="manager" currentStaffId={null} />)
    expect(screen.getByText('A棟')).toBeInTheDocument()
    expect(screen.getByText('B棟')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '全員の予定を見る' })).toBeNull()
  })

  it('管理側の PC はガント', () => {
    render(<DayScreen {...base} role="manager" currentStaffId={null} />)
    expect(screen.getByText(/点線＝指定の無い訪問を空いた所へ置いた目安/)).toBeInTheDocument()
  })

  it('管理側の携帯は自分のカード、目のアイコンで全員', () => {
    viewport.isMobile = true
    render(<DayScreen {...base} role="manager" currentStaffId={1} />)
    expect(screen.queryByText('B棟')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全員の予定を見る' }))
    expect(screen.getByText('B棟')).toBeInTheDocument()
  })

  it('日付の移動', () => {
    render(<DayScreen {...base} role="staff" currentStaffId={1} />)
    fireEvent.click(screen.getByRole('button', { name: '次の日' }))
    expect(base.onDateChange).toHaveBeenCalledWith('2026-10-17')
  })
})
