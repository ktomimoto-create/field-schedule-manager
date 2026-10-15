import type { Schedule } from '../types';
import { normalizeTargetTime } from '../types';

// カード一覧・時間軸で共通に使う表示用の小道具

export const STATUS_META: Record<string, { label: string; tone: string }> = {
  confirmed: { label: '確定', tone: 'confirmed' },
  draft: { label: '仮', tone: 'draft' },
  free: { label: '通常', tone: 'free' },
  cancelled: { label: 'キャンセル', tone: 'cancelled' },
};

export const statusMeta = (status: string | null | undefined) =>
  STATUS_META[status || 'free'] || STATUS_META.free;

export const isVirtualSchedule = (s: Schedule) =>
  typeof s.id === 'string' && s.id.startsWith('temp-');

export const isUnassignedFiller = (s: Schedule) =>
  typeof s.id === 'string' && s.id.startsWith('temp-unassigned-');

// 指定時間 → 時間軸に置く枠（分単位: 0:00 からの経過分）
// 終了時刻は予定表に無いので、時刻指定は1時間の枠、「〜迄」は締切の1時間前から締切まで、AM/PM は時間帯全体で置く。
export interface TimeSlot {
  from: number;
  to: number;
  kind: 'at' | 'until' | 'band';
  label: string;
}

const toMin = (hm: string): number | null => {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export const parseTimeSlot = (raw: string | null | undefined): TimeSlot | null => {
  const t = normalizeTargetTime(raw);
  if (!t) return null;
  if (t === 'AM') return { from: 9 * 60, to: 12 * 60, kind: 'band', label: 'AM' };
  if (t === 'PM') return { from: 13 * 60, to: 17 * 60, kind: 'band', label: 'PM' };
  if (t.endsWith('迄')) {
    const end = toMin(t.slice(0, -1));
    if (end == null) return null;
    return { from: end - 60, to: end, kind: 'until', label: t };
  }
  const start = toMin(t);
  if (start == null) return null;
  return { from: start, to: start + 60, kind: 'at', label: t };
};

// "HH:MM" の実績時刻 → 分
export const hmToMin = (hm: string | null | undefined): number | null => {
  if (!hm) return null;
  const m = String(hm).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
