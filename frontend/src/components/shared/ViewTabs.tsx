import type { ReactNode } from 'react';
import './ViewTabs.css';

export interface ViewTabItem<K extends string> {
  key: K;
  icon: ReactNode;
  label: string;
  /** マウスを乗せたときの説明（何が見えるか） */
  title: string;
}

interface Props<K extends string> {
  items: ViewTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  /** 文字を出さず、アイコンだけのスイッチにする（名前は乗せたときの説明と読み上げに出す） */
  iconOnly?: boolean;
}

/** 上のアイコン（画面）の下に並べる、表示の切り替えタブ */
export function ViewTabs<K extends string>({ items, value, onChange, ariaLabel, iconOnly = false }: Props<K>) {
  return (
    <div className={`view-tabs${iconOnly ? ' is-switch' : ''}`} role="tablist" aria-label={ariaLabel}>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          className={`view-tab${value === item.key ? ' is-active' : ''}`}
          onClick={() => onChange(item.key)}
          title={iconOnly ? `${item.label}: ${item.title}` : item.title}
          aria-label={iconOnly ? item.label : undefined}
        >
          {item.icon}
          {!iconOnly && <span>{item.label}</span>}
        </button>
      ))}
    </div>
  );
}
