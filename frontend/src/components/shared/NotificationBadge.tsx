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
  const bellRef = useRef<HTMLButtonElement>(null)
  // 閉じるときも既読にする（開いている間に届いた分を未読に残さない）
  const markRef = useRef(onMarkAllRead)
  useEffect(() => {
    markRef.current = onMarkAllRead
  }, [onMarkAllRead])

  useEffect(() => {
    if (!open) return
    const close = () => {
      markRef.current()
      setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      bellRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    onMarkAllRead()
    setOpen(!open)
  }

  return (
    <div ref={rootRef} className="tl-root nt-badge-root">
      <button
        ref={bellRef}
        type="button"
        className="btn btn-secondary"
        onClick={toggle}
        title="現地の開始・完了の通知"
        aria-label={unread > 0 ? `通知（未読 ${unread} 件）` : '通知'}
        aria-expanded={open}
      >
        <Bell size={16} />
      </button>
      {unread > 0 && <span className="nt-count">{unread > 99 ? '99+' : unread}</span>}
      {open && (
        <div className="nt-drawer" role="region" aria-label="通知の履歴">
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
                  onMarkAllRead()
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
