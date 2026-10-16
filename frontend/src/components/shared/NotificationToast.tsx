import { useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { noticeText, type ProgressNotice } from '../../utils/timeline/notification'
import './Notification.css'

interface Props {
  notice: ProgressNotice | null
  onOpen: (scheduleId: number) => void
  onClose: () => void
}

// 右下に 5 秒だけ出す。新しい通知が来たら key（notice.id）で作り直して出し直す
export function NotificationToast({ notice, onOpen, onClose }: Props) {
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [notice, onClose])

  if (!notice) return null

  return (
    <div className={`tl-root nt-toast nt-${notice.kind}`} role="status">
      <button
        type="button"
        className="nt-toast-body"
        title="この予定を開く"
        onClick={() => {
          onOpen(notice.scheduleId)
          onClose()
        }}
      >
        <Bell size={16} />
        <span>{noticeText(notice)}</span>
      </button>
      <button type="button" className="nt-icon-btn" onClick={onClose} title="閉じる" aria-label="閉じる">
        <X size={16} />
      </button>
    </div>
  )
}
