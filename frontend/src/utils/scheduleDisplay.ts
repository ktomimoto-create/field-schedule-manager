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

/* ---------- カードの共通表示（種別の色・内容の要約・対応状況） ---------- */

/** 種別 → 色の区分。赤（対応中）・緑（完了）とは重ならない色にする */
export const workTypeKey = (wt: string | null | undefined): string => {
  const t = (wt || '').trim();
  if (!t) return 'none';
  if (t.includes('2次')) return 'second';
  if (t.includes('障害')) return 'fault';
  if (t.includes('承認')) return 'approved';
  if (t.includes('工事')) return 'construct';
  if (t.includes('設置')) return 'install';
  if (t.includes('定期') || t.includes('保守')) return 'periodic';
  if (t.includes('現調')) return 'survey';
  return 'other';
};

/** 作業内容を 1 行の要約にする（規則で要点だけ残す。切るのは表示側）
 *  ＜通報内容＞などの見出し・記号・日時・「〜様より」の前置き・「お願いします」などの結びを外し、
 *  最初の 1 文（足りなければ次の文も）を使う */
const SUMMARY_DROP: RegExp[] = [
  /[＜<][^＞>]{1,24}[＞>]/g,
  /[■□●○◆◇※]+/g,
  /\d{1,2}\/\d{1,2}(?:\([^)]*\))?/g, // 10/19
  /\d{1,2}[:：]\d{2}(?:\s*[〜~～-]\s*\d{1,2}[:：]\d{2})?/g, // 1:00〜4:00
  /【(?:復電|停電|列基板|通報|連絡)[^】]*】/g,
];
const SUMMARY_LEAD = /^[^。]{0,30}?(?:様|さん|氏|所長|監督|担当者?|管理人|管理会社|業者|お客様)[^。]{0,6}?より[、,：:\s]*/;
const SUMMARY_TAIL = /(?:の?(?:ご?対応|点検|確認|訪問)?を?(?:お願い(?:いた)?します|願います|お願いします|依頼)|とのこと|との(?:ご)?連絡(?:あり)?|連絡あり|しています|します|です|ます)[。．.、]*$/;

export const summarizeDescription = (desc: string | null | undefined): string => {
  let t = desc || '';
  for (const rx of SUMMARY_DROP) t = t.replace(rx, ' ');
  const sentences = t
    .split(/[。！!？?\n]/)
    .map(x => x.replace(/\s+/g, ' ').trim())
    .map(x => x.replace(SUMMARY_LEAD, '').replace(SUMMARY_TAIL, '').replace(/^[\s、,・:：]+|[\s、,・]+$/g, ''))
    .filter(x => x.length >= 2);
  if (sentences.length === 0) return t.replace(/\s+/g, ' ').trim();
  let out = sentences[0];
  if (out.length < 8 && sentences[1]) out += '・' + sentences[1];
  return out;
};

export type Progress = 'todo' | 'working' | 'done';

/** 対応状況: 完了（結果が完了 or 作業完了の記録）／対応中（結果が作業中・出発・到着の記録 or 開始だけある）／未着手 */
export const progressOf = (
  s: { id: number | string; result?: string | null; started_at?: string | null; completed_at?: string | null },
  events: { schedule_id: number | null; kind: string }[]
): Progress => {
  const mine = events.filter(e => e.schedule_id === s.id);
  if (s.result === '完了' || mine.some(e => e.kind === 'finish')) return 'done';
  if (s.result === '作業中' || mine.some(e => e.kind === 'arrive' || e.kind === 'depart') || (s.started_at && !s.completed_at)) return 'working';
  return 'todo';
};
