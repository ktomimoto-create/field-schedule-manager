import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getHolidaySet } from '../../utils/holidays';
import './DatePicker.css';

// 日付入力（原本: construction-chart → fe-dotai src/components/shared/DatePicker.tsx）。<input type="date"> は使わない。
// - カレンダーは portal + position:fixed で表示し、画面からはみ出す場合は上下を反転・横をクランプ
// - 土日祝を色分け、「今日」「クリア」ボタン付き
// このアプリで足した点: 押す部分（trigger）を差し替えられる（日付の文字・アイコンだけのボタンなど）

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDate = (val: string | null | undefined): Date | null => {
  if (!val) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(val.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatDisplayDate = (val: string) => {
  const d = parseDate(val);
  return d ? `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` : '';
};

interface Props {
  /** 'YYYY-MM-DD'。未入力は '' */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  title?: string;
  /** 押す部分の中身（無ければ「2026/10/19 📅」の入力欄の形） */
  trigger?: ReactNode;
  /** 押す部分のクラス（trigger を使うとき） */
  triggerClassName?: string;
  /** 「クリア」を出さない（日付が必ず要る画面） */
  noClear?: boolean;
}

const POPUP_W = 248;
const POPUP_H_EST = 340;

export default function DatePicker({ value, onChange, disabled, placeholder, id, 'aria-label': ariaLabel, title, trigger, triggerClassName, noClear }: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = parseDate(value) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const todayStr = formatDate(new Date());

  // 値が外から変わったら表示月を合わせる（effect ではなく描画中に調整する）
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    const d = parseDate(value);
    if (d) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  // 外側クリックと Esc で閉じる（popup は portal なので wrap と popup の両方を見る）
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // ポップアップをビューポート内に収める（横クランプ＋上下フリップ）
  const placePopup = (popupH: number, popupW: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    let left = Math.min(rect.left, window.innerWidth - popupW - margin);
    left = Math.max(margin, left);
    let top = rect.bottom + 4;
    if (top + popupH > window.innerHeight - margin) {
      const above = rect.top - 4 - popupH;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - popupH - margin);
    }
    setPopupPos({ top, left });
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!open) placePopup(POPUP_H_EST, POPUP_W);
    setOpen(o => !o);
  };

  useLayoutEffect(() => {
    if (!open || !popupRef.current) return;
    const pop = popupRef.current.getBoundingClientRect();
    placePopup(pop.height || POPUP_H_EST, pop.width || POPUP_W);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const pop = popupRef.current?.getBoundingClientRect();
      placePopup(pop?.height || POPUP_H_EST, pop?.width || POPUP_W);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const holidaySet = useMemo(() => getHolidaySet(`${year}-01-01`, `${year}-12-31`), [year]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const displayValue = formatDisplayDate(value);

  return (
    <div className={`dp-wrap${trigger ? ' has-trigger' : ''}`} ref={wrapRef}>
      <button
        id={id}
        type="button"
        className={trigger ? `${triggerClassName ?? ''}${disabled ? ' dp-disabled' : ''}` : `dp-input${disabled ? ' dp-disabled' : ''}`}
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
      >
        {trigger ?? (
          <>
            <span className={`dp-value${displayValue ? ' dp-num' : ''}`}>
              {displayValue || <span className="dp-placeholder">{placeholder ?? '日付を選択'}</span>}
            </span>
            <Calendar size={16} className="dp-icon" aria-hidden />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={popupRef}
            className="dp-popup"
            role="dialog"
            aria-label="日付を選択"
            style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 1100, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="dp-header">
              <button type="button" className="dp-nav dp-nav-prev" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="前の月">
                <ChevronLeft size={16} />
              </button>
              <span className="dp-title dp-num">{year}年{month + 1}月</span>
              <button type="button" className="dp-nav dp-nav-next" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="次の月">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="dp-grid">
              {DAY_NAMES.map(d => (
                <div key={d} className={`dp-weekday${d === '日' ? ' dp-sun' : d === '土' ? ' dp-sat' : ''}`}>{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="dp-cell dp-empty" />;
                const date = new Date(year, month, day);
                const dateStr = formatDate(date);
                const wd = date.getDay();
                const isHoliday = holidaySet.has(dateStr);
                return (
                  <button
                    key={i}
                    type="button"
                    className={[
                      'dp-cell dp-num',
                      dateStr === value ? 'dp-selected' : '',
                      dateStr === todayStr ? 'dp-today' : '',
                      isHoliday || wd === 0 ? 'dp-sun' : wd === 6 ? 'dp-sat' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => pick(dateStr)}
                    title={isHoliday ? '祝日' : undefined}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="dp-footer">
              {noClear ? <span /> : <button type="button" className="dp-btn dp-btn-ghost" onClick={() => pick('')}>クリア</button>}
              <button type="button" className="dp-btn" onClick={() => pick(todayStr)}>今日</button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
