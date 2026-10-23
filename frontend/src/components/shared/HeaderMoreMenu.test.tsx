import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HeaderMoreMenu } from './HeaderMoreMenu'

const items = (onRefresh = vi.fn()) => [
  { key: 'refresh', icon: null, label: 'データを更新', onSelect: onRefresh },
  { key: 'sandbox', icon: null, label: 'お試しモードを終了', onSelect: vi.fn(), active: true },
]

describe('HeaderMoreMenu', () => {
  it('押すと操作を並べ、選ぶとその操作をして閉じる', () => {
    const onRefresh = vi.fn()
    render(<HeaderMoreMenu items={items(onRefresh)} />)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByLabelText('そのほかの操作'))
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['データを更新', 'お試しモードを終了'])
    expect(screen.getByText('お試しモードを終了').closest('button')).toHaveClass('active')

    fireEvent.click(screen.getByText('データを更新'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('外を押すか Esc で閉じる', () => {
    render(
      <div>
        <p>外</p>
        <HeaderMoreMenu items={items()} />
      </div>,
    )
    fireEvent.click(screen.getByLabelText('そのほかの操作'))
    fireEvent.mouseDown(screen.getByText('外'))
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByLabelText('そのほかの操作'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
