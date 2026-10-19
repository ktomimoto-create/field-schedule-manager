import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './TooltipLayer.css';

// ボタンなどにカーソルを乗せたときの説明（ブラウザ標準の title の吹き出しの代わり）。
// 画面全体で 1 つだけ置く。title を持つ要素に乗ったら、title を data-tip へ移して標準の吹き出しを止め、
// テーマに合わせた吹き出しを要素の下（入らなければ上）に出す。各画面のコードは今まで通り title を書けばよい。

const DELAY_MS = 350;

interface Tip {
  text: string;
  x: number;
  y: number;
  place: 'below' | 'above';
}

const textOf = (el: HTMLElement): string => {
  const t = el.getAttribute('title');
  if (t) {
    el.setAttribute('data-tip', t);
    el.removeAttribute('title');
    return t;
  }
  return el.getAttribute('data-tip') || '';
};

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setTip(null);
    };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (!el || el === current.current) return;
      const text = textOf(el);
      clear();
      if (!text) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.bottom + 8 + 40 < window.innerHeight;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, place: below ? 'below' : 'above' });
      }, DELAY_MS);
    };
    const onOut = (e: MouseEvent) => {
      const el = current.current;
      if (!el) return;
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      clear();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousedown', clear, true);
    document.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousedown', clear, true);
      document.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // 画面の端からはみ出さないように横位置をそろえる（描画直後に実寸で直す。state は使わない）
  const boxRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!tip || !box) return;
    box.style.marginLeft = '0px';
    const r = box.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (r.left < margin) dx = margin - r.left;
    else if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
    box.style.marginLeft = `${dx}px`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef}
      className={`app-tooltip is-${tip.place}`}
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>,
    document.body
  );
}
