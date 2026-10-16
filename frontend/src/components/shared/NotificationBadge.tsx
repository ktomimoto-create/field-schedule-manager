import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { nowHmJst } from '../../utils/timeline/dates'
import { noticeText, type ProgressNotice } from '../../utils/timeline/notification'
import './Notification.css'

interface Props {
  items: ProgressNotice[]
  unread: number
  onOpen: (scheduleId: number) => void
  onMarkAllRead: () => void
}

export function NotificationBadge({ items, unread, onOpen, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) onMarkAllRead()
    setOpen(!open)
  }

  return (
    <div ref={rootRef} className="tl-root nt-badge-root">
      <button type="button" className="btn btn-secondary" onClick={toggle} title="現地の開始・完了の通知" aria-label="通知" aria-expanded={open}>
        <Bell size={16} />
      </button>
      {unread > 0 && <span className="nt-count">{unread > 99 ? '99+' : unread}</span>}
      {open && (
        <div className="nt-drawer" role="dialog" aria-label="通知の履歴">
          {items.length === 0 ? (
            <p className="nt-empty">まだ通知はありません</p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                type="button"
                className={`nt-item nt-${n.kind}`}
                onClick={() => {
                  onOpen(n.scheduleId)
                  setOpen(false)
                }}
              >
                <span className="nt-item-time tl-num">{nowHmJst(new Date(n.receivedAt))}</span>
                <span className="nt-item-text">{noticeText(n)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
