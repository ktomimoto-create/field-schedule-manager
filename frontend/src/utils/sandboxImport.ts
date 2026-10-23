import type { Schedule, Staff } from '../types';
import { findStaffByName, normalizeTargetTime } from '../types';

// 開発用: お試しモードに、Google スプレッドシートの行動予定表（その日のシート）を読み込む。
// データは frontend/public/_sandbox/<YYYY-MM-DD>.json に置く（実データなので git には入れない。.gitignore 済み）。
// 形: { date, rows: [[区分, タイプ, BOX, 号機, 物件名, 種別, 作業内容, 時間, 対応者, エリア, 県別, 移動, 同行者, 依頼番号, 結果, 備考], ...] }
// 本番の DB には書かない（お試しモードの端末内データだけ）。

export const sandboxImportEnabled = import.meta.env.DEV;

const norm = (s: string) => s.replace(/\s/g, '').replace(/﨑/g, '崎');

/** 対応者名 → 名簿。共通の曖昧一致で見つからないとき（空白なしの本名・異体字）は、前方一致が 1 人だけなら採用 */
const resolveStaff = (staff: Staff[], name: string): Staff | null => {
  if (!name) return null;
  const hit = findStaffByName(staff, name);
  if (hit) return hit;
  const cands = staff.filter(s => norm(s.name).startsWith(norm(name)));
  return cands.length === 1 ? cands[0] : null;
};

export const loadSandboxDay = async (date: string, staff: Staff[]): Promise<Schedule[] | null> => {
  const res = await fetch(`/_sandbox/${date}.json`, { cache: 'no-store' });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
  const src = (await res.json()) as { date: string; rows: string[][] };
  const seq: Record<string, number> = {};
  return src.rows.map((r, i) => {
    const [division, type, box, unit, prop, workType, desc, time, staffName, area, pref, transport, co, req, result, notes] = r;
    const st = resolveStaff(staff, staffName);
    const key = st ? `id-${st.id}` : `n-${staffName}`;
    seq[key] = seq[key] ?? 0;
    const cancelled = result === 'キャンセル';
    return {
      id: 900000 + i,
      status: cancelled ? 'cancelled' : 'confirmed',
      division: division || (cancelled ? '未定' : ''),
      type,
      box,
      unit_number: unit,
      property_name: prop,
      work_type: workType,
      description: desc,
      target_time: normalizeTargetTime(time) || time,
      date,
      staff_id: st ? st.id : null,
      staff_name: st ? st.name : staffName,
      area,
      prefecture: pref,
      transport,
      co_worker: co,
      request_number: req,
      time_limit: '',
      course: st?.default_course ? String(st.default_course) : '',
      result: cancelled ? '' : result,
      notes,
      is_transferred: 1,
      sort_order: seq[key]++,
      disorder_type: null,
      level: null,
      level_3: null,
    } as Schedule;
  });
};
