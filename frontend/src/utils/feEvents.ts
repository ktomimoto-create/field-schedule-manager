import { supabase } from '../supabaseClient';
import type { Schedule } from '../types';

// FE のボタン記録（勤務開始 → 出発 → 到着 → 作業完了 → 勤務終了）の読み書き。
// DB: sql/fe_events.sql（fe_events テーブルと fe_record_event / fe_undo_last_event）。
// お試しモードでは本番 DB に書かず、この端末の localStorage にだけ記録する（別タブにも BroadcastChannel で伝える）。

export type FeEventKind = 'shift_start' | 'depart' | 'arrive' | 'finish' | 'shift_end';

export interface FeEvent {
  id: number | string;
  staff_id: number;
  schedule_id: number | null;
  kind: FeEventKind;
  occurred_at: string; // ISO
  work_date: string; // YYYY-MM-DD（JST）
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
}

export const FE_EVENT_LABELS: Record<FeEventKind, string> = {
  shift_start: '勤務開始',
  depart: '出発',
  arrive: '到着',
  finish: '作業完了',
  shift_end: '勤務終了',
};

const SANDBOX_KEY = 'field_app_sandbox_fe_events';
const CHANNEL = 'field_app_fe_events';
const WRITE_TIMEOUT_MS = 15_000;

export const jstDate = (d: Date = new Date()): string => {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return j.toISOString().slice(0, 10);
};

export const jstHm = (iso: string): string => {
  const j = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${j.getUTCHours()}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
};

const withTimeout = <T,>(p: PromiseLike<T>, label: string): Promise<T> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}が ${WRITE_TIMEOUT_MS / 1000} 秒以内に終わりませんでした。通信状態を確かめて、もう一度押してください。`)), WRITE_TIMEOUT_MS)),
  ]);

/* ---------- お試しモード（端末内） ---------- */

const readSandbox = (): FeEvent[] => {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    return raw ? (JSON.parse(raw) as FeEvent[]) : [];
  } catch {
    return [];
  }
};

const writeSandbox = (events: FeEvent[]) => {
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(events));
  } catch { /* 保存できない環境では画面の中だけ */ }
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage('changed');
    ch.close();
  } catch { /* noop */ }
};

export const subscribeSandboxFeEvents = (onChange: () => void): (() => void) => {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => onChange();
  } catch { /* noop */ }
  const onStorage = (e: StorageEvent) => {
    if (e.key === SANDBOX_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
};

export const clearSandboxFeEvents = () => writeSandbox([]);

/* ---------- 位置 ---------- */

export interface PositionFix {
  lat: number;
  lng: number;
  accuracy_m: number;
}

/** ボタンを押したときの位置。取れなければ null（記録は位置なしで続ける） */
export const getCurrentPositionSafe = (timeoutMs = 8000): Promise<PositionFix | null> =>
  new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });

/* ---------- 読み書き ---------- */

/** 指定した日の記録（DB に表がまだ無いときは空配列と unavailable=true） */
export const listFeEvents = async (fromDate: string, toDate: string, sandbox: boolean): Promise<{ events: FeEvent[]; unavailable: boolean }> => {
  if (sandbox) {
    return { events: readSandbox().filter(e => e.work_date >= fromDate && e.work_date <= toDate), unavailable: false };
  }
  const { data, error } = await supabase
    .from('fe_events')
    .select('id, staff_id, schedule_id, kind, occurred_at, work_date, lat, lng, accuracy_m')
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
    .order('occurred_at', { ascending: true });
  if (error) return { events: [], unavailable: true };
  return { events: (data || []) as FeEvent[], unavailable: false };
};

export interface RecordInput {
  kind: FeEventKind;
  staffId: number;
  schedule: Schedule | null;
  position: PositionFix | null;
}

/** お試しモードでは端末に記録、本番では RPC（誰の記録かは DB 側がログインから決める） */
export const recordFeEvent = async (input: RecordInput, sandbox: boolean): Promise<FeEvent> => {
  const scheduleId = input.schedule && typeof input.schedule.id === 'number' ? input.schedule.id : null;
  if (sandbox) {
    const now = new Date();
    const ev: FeEvent = {
      id: `local-${now.getTime()}`,
      staff_id: input.staffId,
      schedule_id: ['depart', 'arrive', 'finish'].includes(input.kind) ? scheduleId : null,
      kind: input.kind,
      occurred_at: now.toISOString(),
      work_date: jstDate(now),
      lat: input.position?.lat ?? null,
      lng: input.position?.lng ?? null,
      accuracy_m: input.position?.accuracy_m ?? null,
    };
    writeSandbox([...readSandbox(), ev]);
    return ev;
  }
  const { data, error } = await withTimeout(
    supabase.rpc('fe_record_event', {
      p_kind: input.kind,
      p_schedule_id: scheduleId,
      p_lat: input.position?.lat ?? null,
      p_lng: input.position?.lng ?? null,
      p_accuracy_m: input.position?.accuracy_m ?? null,
    }),
    `${FE_EVENT_LABELS[input.kind]}の記録`
  );
  if (error) throw new Error(error.message || `${FE_EVENT_LABELS[input.kind]}を記録できませんでした`);
  return data as FeEvent;
};

/** 押し間違いの取り消し（その人の今日の最後の記録を 1 件） */
export const undoLastFeEvent = async (staffId: number, sandbox: boolean): Promise<FeEvent | null> => {
  if (sandbox) {
    const all = readSandbox();
    const today = jstDate();
    let idx = -1;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].staff_id === staffId && all[i].work_date === today) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return null;
    const [removed] = all.splice(idx, 1);
    writeSandbox(all);
    return removed;
  }
  const { data, error } = await withTimeout(supabase.rpc('fe_undo_last_event'), '取り消し');
  if (error) throw new Error(error.message || '取り消せませんでした');
  return (data as FeEvent) || null;
};

/* ---------- 状態の組み立て ---------- */

export type VisitStage = 'todo' | 'moving' | 'working' | 'done';

export interface VisitState {
  schedule: Schedule;
  stage: VisitStage;
  departAt: string | null;
  arriveAt: string | null;
  finishAt: string | null;
}

export interface DayState {
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  visits: VisitState[];
  /** 次に押すボタン（null = 今日は終わり） */
  next: { kind: FeEventKind; visit: VisitState | null } | null;
  lastEvent: FeEvent | null;
}

/** 1 人分の今日の予定と記録から、各訪問の段階と「次に押すボタン」を決める */
export const buildDayState = (visitsInOrder: Schedule[], events: FeEvent[]): DayState => {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const shiftStart = sorted.find(e => e.kind === 'shift_start') || null;
  const shiftEnd = [...sorted].reverse().find(e => e.kind === 'shift_end') || null;
  const visits: VisitState[] = visitsInOrder.map(s => {
    const mine = sorted.filter(e => e.schedule_id === s.id);
    const last = (k: FeEventKind) => [...mine].reverse().find(e => e.kind === k)?.occurred_at ?? null;
    const departAt = last('depart');
    const arriveAt = last('arrive');
    const finishAt = last('finish');
    // 記録が無くても、結果が「完了」の予定は済んだものとして扱う（今までの結果報告との共存）
    const stage: VisitStage = finishAt || s.result === '完了' ? 'done' : arriveAt ? 'working' : departAt ? 'moving' : 'todo';
    return { schedule: s, stage, departAt, arriveAt, finishAt };
  });

  let next: DayState['next'] = null;
  if (!shiftStart) {
    next = { kind: 'shift_start', visit: null };
  } else if (!shiftEnd) {
    const active = visits.find(v => v.stage === 'moving' || v.stage === 'working');
    const target = active || visits.find(v => v.stage === 'todo') || null;
    if (target) {
      next = { kind: target.stage === 'todo' ? 'depart' : target.stage === 'moving' ? 'arrive' : 'finish', visit: target };
    } else {
      next = { kind: 'shift_end', visit: null };
    }
  }
  return { shiftStartAt: shiftStart?.occurred_at ?? null, shiftEndAt: shiftEnd?.occurred_at ?? null, visits, next, lastEvent: sorted[sorted.length - 1] || null };
};
