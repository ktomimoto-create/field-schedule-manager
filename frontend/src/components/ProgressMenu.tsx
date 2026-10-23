import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Circle, History, Wrench } from 'lucide-react';
import type { Progress } from '../utils/scheduleDisplay';
import { Spinner } from './shared/Spinner';
import './ProgressMenu.css';

// カードを右クリックして開く「対応状況」の切替（管理側）。下にそのカードの変更履歴を出す。

export interface StatusHistoryItem {
  at: string; // ISO
  by: string;
  text: string;
}

const OPTIONS: { key: Progress; label: string; icon: typeof Circle }[] = [
  { key: 'todo', label: '未着手', icon: Circle },
  { key: 'working', label: '対応中', icon: Wrench },
  { key: 'done', label: '完了', icon: CheckCircle2 },
];

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface Props {
  /** 右クリックした位置（画面の座標） */
  at: { x: number; y: number };
  title: string;
  current: Progress;
  onSelect: (p: Progress) => Promise<void>;
  loadHistory: () => Promise<StatusHistoryItem[]>;
  onClose: () => void;
}

export const ProgressMenu: React.FC<Props> = ({ at, title, current, onSelect, loadHistory, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [history, setHistory] = useState<StatusHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 220;
    const w = ref.current?.offsetWidth ?? 260;
    // 入りきらなければ上向き・左向きに開く
    const top = at.y + h + 8 > window.innerHeight ? Math.max(8, at.y - h) : at.y;
    const left = at.x + w + 8 > window.innerWidth ? Math.max(8, at.x - w) : at.x;
    setPos({ left, top });
  }, [at, history]);

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then(h => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="pm-panel" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }} role="menu" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <div className="pm-title">{title}</div>
      <div className="pm-options">
        {OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            role="menuitemradio"
            aria-checked={current === o.key}
            className={`pm-option p-${o.key}${current === o.key ? ' is-current' : ''}`}
            disabled={busy || current === o.key}
            onClick={async () => {
              setBusy(true);
              try {
                await onSelect(o.key);
                onClose();
              } catch {
                setBusy(false);
              }
            }}
          >
            <o.icon size={14} />
            {o.label}
          </button>
        ))}
      </div>
      <div className="pm-history">
        <div className="pm-history-head">
          <History size={12} />
          変更履歴
        </div>
        {history === null ? (
          <div className="pm-loading"><Spinner size={16} /></div>
        ) : history.length === 0 ? (
          <div className="pm-empty">まだ変更はありません</div>
        ) : (
          <ol className="pm-list">
            {history.map((h, i) => (
              <li key={i}>
                <span className="pm-at">{fmtAt(h.at)}</span>
                <span className="pm-text">{h.text}</span>
                <span className="pm-by">{h.by}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>,
    document.body
  );
};
