import { useEffect, useMemo, useState } from 'react';
import type { Schedule } from '../types';
import { fetchAddressesByUnit } from './geocode';
import { resolveAddress } from './addressResolver';

// カードの 4 行目「県別・エリア」。予定の県別が空のときは物件マスタの住所から出す（読むだけ）

const PREF_LABEL: Record<string, string> = { '23': '東京23区', '都下': '東京都下', '東京': '東京都' };
const prefLabel = (p: string) => {
  const t = p.trim();
  if (!t) return '';
  if (PREF_LABEL[t]) return PREF_LABEL[t];
  return /[都道府県]$/.test(t) ? t : `${t}県`;
};
// 同じ名前の区を見分ける印（中央区T・中央区C など）は画面では外す
const areaLabel = (a: string) => a.trim().replace(/(区)[A-Z]$/, '$1');

export const usePlaceLabel = (schedules: Schedule[]) => {
  const [master, setMaster] = useState<Record<string, { prefecture: string; area: string }>>({});
  const missing = useMemo(
    () => [...new Set(schedules.filter(s => !(s.prefecture || '').trim() && (s.unit_number || '').trim()).map(s => s.unit_number!.trim()))].filter(u => !(u in master)).sort().join(','),
    [schedules, master]
  );
  useEffect(() => {
    if (!missing) return;
    let cancelled = false;
    const units = missing.split(',');
    void fetchAddressesByUnit(units).then(addr => {
      if (cancelled) return;
      const next: Record<string, { prefecture: string; area: string }> = {};
      for (const u of units) next[u] = addr[u] ? resolveAddress(addr[u]) : { prefecture: '', area: '' };
      setMaster(prev => ({ ...prev, ...next }));
    }).catch(() => { /* 出せなければエリアだけ */ });
    return () => {
      cancelled = true;
    };
  }, [missing]);

  return (s: Schedule): string => {
    const m = master[(s.unit_number || '').trim()];
    const pref = prefLabel((s.prefecture || '').trim() || m?.prefecture || '');
    const area = areaLabel((s.area || '').trim() || m?.area || '');
    return [pref, area].filter(Boolean).join(' ');
  };
};
