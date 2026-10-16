import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Spinner } from './Spinner';

// プルダウンの共有部品（ブラウザ標準の select 要素は使わない。全プロジェクト共通の決まり 2026-09-16）。
// 原本は app-template の src/components/shared/Select.tsx。
// 見た目の基準は Knowledge-DB の GlassSelect: 角丸パネル・pill 状の項目・選択にチェック・画面下半分では上向きに開く。
// 色と寸法は index.css の .select-* （このアプリのトークン --primary などだけを使う）。
// ボタンは元の select 要素 と同じ className を受け取り、同じ場所・同じ幅で置き換えられるようにしている（外側の枠は作らない）。
// 一覧はパネルを body 直下に出す（position: fixed）ので、表の行・モーダル・overflow 枠の中でも切れない。
// Esc は capture で受けて preventDefault する（モーダルの中で使っても、先にモーダルが閉じない）。

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** ボタン側に出す短い表示（省略時は label） */
  selectedLabel?: string;
}

interface Props<V extends string> {
  value: V | '';
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  /** value に合う項目が無いときにボタンへ出す文字 */
  placeholder?: string;
  disabled?: boolean;
  /** 読み込み中。ボタンには文字を出さず輪（Spinner）だけを出し、操作できなくする */
  loading?: boolean;
  /** ボタンに付ける class（元の select 要素 の class をそのまま渡す。省略時は form-control） */
  className?: string;
  style?: CSSProperties;
  id?: string;
  title?: string;
  autoFocus?: boolean;
  /** ボタンからフォーカスが外れたとき（一覧の項目を押したときは外れない） */
  onBlur?: (e: FocusEvent<HTMLButtonElement>) => void;
  'aria-label'?: string;
}

const PANEL_GAP = 6;
const VIEW_MARGIN = 8;

export function Select<V extends string>({
  value, options, onChange, placeholder = '選択してください', disabled, loading, className = 'form-control',
  style, id, title, autoFocus, onBlur, 'aria-label': ariaLabel,
}: Props<V>) {
  const [openState, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find(o => o.value === value);
  const isDisabled = disabled || loading;
  // 操作できなくなったら（読み込み開始・無効化）開いていても閉じる
  const open = openState && !isDisabled;

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };
  // 元の select 要素 と同じく、同じ項目を選び直したときは onChange を呼ばない
  const openPanel = () => {
    setHighlight(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  };
  const choose = (v: V) => {
    if (v !== value) onChange(v);
    close();
  };

  useEffect(() => {
    if (autoFocus) btnRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 位置: 画面下半分なら上に開く。左右は画面内に収める
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(Math.max(r.width, 180), vw - VIEW_MARGIN * 2);
    const left = Math.min(Math.max(VIEW_MARGIN, r.left), vw - width - VIEW_MARGIN);
    const above = r.top + r.height / 2 > window.innerHeight / 2;
    const maxHeight = Math.max(120, (above ? r.top : window.innerHeight - r.bottom) - PANEL_GAP - VIEW_MARGIN);
    setPos(
      above
        ? { left, width, bottom: window.innerHeight - r.top + PANEL_GAP, maxHeight }
        : { left, width, top: r.bottom + PANEL_GAP, maxHeight },
    );
  }, [open]);

  // 開いたら選択中の項目が見える位置まで一覧を送る
  useEffect(() => {
    if (!open || !pos || !panelRef.current) return;
    const el = panelRef.current.querySelector<HTMLElement>('.is-selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // 開いている間に一覧を上下キーで動かしたとき、ハイライトが見える位置へ送る
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const onButtonKey = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPanel();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = options[highlight];
      if (o) choose(o.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`select-trigger ${className}`}
        style={style}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onButtonKey}
        onBlur={onBlur}
      >
        {loading ? (
          <span className="select-value select-loading">
            <Spinner size={14} />
          </span>
        ) : (
          // 元の select 要素 と同じく「いちばん長い項目」の幅になるよう、全項目を見えない形で重ねて幅だけ取る
          <span className="select-value">
            <span className={`select-value-text${selected ? '' : ' select-placeholder'}`}>
              {selected ? (selected.selectedLabel ?? selected.label) : placeholder}
            </span>
            {options.map((o, i) => (
              <span key={`${i}:${o.value}`} className="select-value-sizer" aria-hidden>
                {o.selectedLabel ?? o.label}
              </span>
            ))}
          </span>
        )}
        <ChevronDown className="select-chevron" aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            id={listId}
            className="select-panel"
            role="listbox"
            style={pos}
            // 一覧の余白やスクロールバーを押してもボタンのフォーカスを外さない（onBlur で保存する表のセル編集のため）。
            // パネルは body 直下だが React のイベントは呼び出し元（表の行・モーダルの背景など）へ伝わるので、ここで止める
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
            onMouseUp={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
          >
            {options.map((o, i) => {
              const isSel = o.value === value;
              return (
                <div
                  key={`${i}:${o.value}`}
                  role="option"
                  aria-selected={isSel}
                  className={`select-option${isSel ? ' is-selected' : ''}${i === highlight ? ' is-active' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={e => {
                    e.preventDefault();
                    choose(o.value);
                  }}
                >
                  <span className="select-option-label">{o.label}</span>
                  {isSel && <Check size={16} aria-hidden className="select-check" />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
