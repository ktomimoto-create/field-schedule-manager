import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import './HeaderMoreMenu.css'

export interface HeaderMoreItem {
  key: string
  icon: ReactNode
  label: string
  onSelect: () => void
  // 今オンになっている切替（お試し中・旧画面のタブを表示中など）
  active?: boolean
}

interface Props {
  items: HeaderMoreItem[]
}

// 携帯幅のヘッダーで、ふだん使わない操作をまとめる「⋯」メニュー。
// PC 幅では CSS で隠し、今までどおりヘッダーにボタンを並べる。
export function HeaderMoreMenu({ items }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="tl-root hm-root">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(!open)}
        title="そのほかの操作"
        aria-label="そのほかの操作"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="hm-panel" role="menu">
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`hm-item ${item.active ? 'active' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span className="hm-item-icon">{item.icon}</span>
              <span className="hm-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
