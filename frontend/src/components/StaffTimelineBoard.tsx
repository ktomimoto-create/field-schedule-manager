import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CarFront, Footprints, Route, TrainFront, UtensilsCrossed } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, findStaffByName, normalizeTargetTime } from '../types';
import { hmToMin, parseTimeSlot, progressOf, statusMeta } from '../utils/scheduleDisplay';
import { jstHm, type FeEvent } from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import { UNASSIGNED, VisitCardBody } from './StaffLaneBoard';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import { ProgressMenu, type StatusHistoryItem } from './ProgressMenu';
import type { Progress } from '../utils/scheduleDisplay';
import { isSameSite, planRoute, sameBuilding, totalTravel, travelLeg, travelModeOf, useHomeBase, useSitePositions, WORK_MIN, type LegKind, type TravelMode } from '../utils/route';
import { useFunnaviReservations, usesVehicle } from '../utils/vehicleUsers';
import type { LatLng } from '../utils/geocode';
import './StaffLaneBoard.css';
import './StaffTimelineBoard.css';

// 予定表の時間軸（カード表示を基にした形）: 1 人 1 行、左に担当、右に時間の軸。
// 訪問カードを時刻の位置に置く。時間の指定が無い訪問は、出動から順番どおりに 1 件 60 分・移動（距離からの見込み＋10 分）で並べた「見込み」の位置（点線の枠）。
// 「近い順に並べ替え」で、時間指定を守りながら移動が短くなる順番にする。
// カードの下の細い帯は実績（青＝移動、緑＝作業）。

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

const DAY_START = 9 * 60;
/** 昼休憩 60 分（12:00 以降、最初に手が空いたところで取る。移動を含めて最大 80 分） */
const LUNCH_FROM = 12 * 60;
const LUNCH_MIN = 60;
/** 昼休憩は移動を含めて最大 80 分（移動が 20 分を超える分は休憩の中で動く） */
const LUNCH_WITH_MOVE_MAX = 80;
/** 昼休憩の始まりから次の訪問を始めるまでの時間（移動 mv 分を含む） */
const lunchSpan = (mv: number) => Math.max(mv, Math.min(LUNCH_MIN + mv, LUNCH_WITH_MOVE_MAX));
/** 重ねたカードをずらす量（px）。3 枚目以降は同じ位置 */
const STACK_SHIFT = 6;
const STACK_MAX = 2;
/** カードの下に、移動・待ちの見込み（点線）と実績（帯）を置く。重なりの有無で線の高さが変わらないように固定の位置 */
const CARD_H = 86;
// 線はカードの上に置く（カードは重なっても上端がずれないので、どの行も同じ高さに並ぶ）
const MOVE_Y = 10;
const BAR_Y = 17;
const CARD_TOP = 26;
const TRACK_H = CARD_TOP + CARD_H + STACK_SHIFT * STACK_MAX + 6;

const LEG_ICON: Partial<Record<LegKind, typeof CarFront>> = { car: CarFront, train: TrainFront, walk: Footprints };
const LEG_LABEL: Record<LegKind, string> = { car: '車', train: '電車・バスと徒歩', walk: '徒歩', same: '同じ建物', unknown: '位置が分からないため 15 分' };
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);

interface Placed {
  schedule: Schedule;
  no: number;
  start: number;
  end: number;
  estimated: boolean;
  late: boolean;
  /** 前の場所（出動なら拠点）からの移動（分）と、そのしかた */
  move: number;
  legKind: LegKind;
  /** 前の訪問が終わってから移動を始めるまでの待ち（時刻指定の訪問の前など） */
  waitFrom: number;
  /** 同じ時間帯に重なっている訪問の中での順番（0 が先頭）と、重なりの件数 */
  stackIndex: number;
  stackSize: number;
  /** 重なりの組の目印（先頭の訪問の id） */
  stackKey: string;
  /** 重ねているときに先頭のカードへ出す番号（例「1〜3」） */
  stackLabel: string;
}

interface Row {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  placed: Placed[];
  /** 出動（勤務開始）の時刻。記録が無ければ 9:00 の見込み */
  depart: number;
  departRecorded: boolean;
  /** 今の順番の移動の合計と、近い順にしたときの順番・合計 */
  travelNow: number;
  travelBest: number;
  bestOrder: Schedule[];
  mode: TravelMode;
  /** 昼休憩（取った位置）。午前で終わる人は無し */
  lunch: [number, number] | null;
  done: number;
  live: number;
}

interface Props {
  schedules: Schedule[];
  staff: Staff[];
  date: string;
  canEdit: boolean;
  activeLocks: Record<number, LockInfo>;
  onOpenEditModal: (s: Schedule) => void;
  onReorder?: (orders: { id: number | string; sort_order: number }[]) => Promise<void>;
  feEvents?: FeEvent[];
  /** 対応状況を変える（管理側。カードの右クリック） */
  onSetProgress?: (s: Schedule, p: Progress) => Promise<void>;
  loadStatusHistory?: (s: Schedule) => Promise<StatusHistoryItem[]>;
}

const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const StaffTimelineBoard: React.FC<Props> = ({ schedules, staff, date, canEdit, activeLocks, onOpenEditModal, onReorder, feEvents = [], onSetProgress, loadStatusHistory }) => {
  const [now, setNow] = useState(nowMin);
  const placeOf = usePlaceLabel(schedules);
  // 右クリックで開く対応状況のメニュー
  const [menu, setMenu] = useState<{ s: Schedule; x: number; y: number } | null>(null);
  const menuId = menu?.s.id;
  const loadMenuHistory = useCallback(async () => {
    const target = schedules.find(x => x.id === menuId);
    return target && loadStatusHistory ? loadStatusHistory(target) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId, loadStatusHistory]);
  const closeMenu = useCallback(() => setMenu(null), []);
  const sitePos = useSitePositions(schedules);
  const homeBase = useHomeBase();
  const reservations = useFunnaviReservations(date);
  const [busy, setBusy] = useState(false);
  // 横に広げている重なりの組（クリックで広げる・もう一度か外をクリックで閉じる）
  const [spread, setSpread] = useState<string | null>(null);
  // 広げた重なりの中でのドラッグ並べ替え
  const [dragId, setDragId] = useState<number | string | null>(null);
  useEffect(() => {
    if (!spread) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.stl-card.in-stack')) setSpread(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSpread(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [spread]);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, { key: string; name: string; member?: Staff; course: number; items: Schedule[] }>();
    for (const s of schedules) {
      // 担当の ID が無くても、名前がマスタの人に当たればその人（例: 高田）
      const member = staff.find(st => st.id === s.staff_id) ?? findStaffByName(staff, s.staff_name);
      const name = member ? member.name : s.staff_name || UNASSIGNED;
      const key = member ? `id-${member.id}` : `n-${name}`;
      if (!map.has(key)) {
        const c = Number(member?.default_course ?? s.course);
        map.set(key, { key, name, member, course: Number.isFinite(c) && String(member?.default_course ?? s.course ?? '').trim() !== '' ? c : Infinity, items: [] });
      }
      map.get(key)!.items.push(s);
    }
    const knownSurnames = staff.map(st => st.name.trim().split(/\s+/)[0]).filter(n => n.length >= 1);
    const out: Row[] = [];
    for (const g of map.values()) {
      g.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
      // 出動（勤務開始）して拠点を出たところから移動が始まる。1 件目は出動＋移動の後ろ
      const shiftEv = g.member
        ? feEvents
            .filter(e => e.staff_id === g.member!.id && e.work_date === date && e.kind === 'shift_start')
            .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0]
        : undefined;
      const departRec = shiftEv ? hmToMin(jstHm(shiftEv.occurred_at)) ?? undefined : undefined;
      // 出発地: 出動を押した場所。記録が無ければ拠点（岩本町2丁目10-1）から
      const base: LatLng | null = shiftEv?.lat != null && shiftEv?.lng != null ? { lat: shiftEv.lat, lng: shiftEv.lng } : homeBase;
      const posOf = (x: Schedule) => sitePos[(x.unit_number || '').trim()] ?? null;
      // 移動の手段: 車両の基本利用者（または交通手段が車）なら車、それ以外は電車・徒歩
      const mode = travelModeOf(g.items, usesVehicle(g.name, reservations, knownSurnames));
      // 出動の記録が無ければ 9:00 の見込み。ただし 1 件目が 8:00 指定などなら、間に合うように早めに出たとみなす
      const firstNeed = Math.min(
        Infinity,
        ...g.items.map(x => {
          const sl = parseTimeSlot(x.target_time);
          return sl && sl.kind !== 'until' && sl.from < LUNCH_FROM ? sl.from - travelLeg(base, posOf(x), mode).min : Infinity;
        })
      );
      const depart = departRec ?? Math.min(DAY_START, firstNeed);
      // 時刻の割り当て: 行の順番ではなく、時間の指定を守る順に枠を押さえる
      //   ① 時刻指定（10:00 など）はその時刻 ② AM 指定は午前の空き ③ PM 指定は午後の空き
      //   ④ 時間指定なし・「〜迄」は行の順に空いた所へ。最後に昼休憩（移動込みで最大 80 分）を 12:00 以降の最初の空きに入れる
      //   同じ建物・同じ敷地（物件名の括弧書き・①② を除いて同じ）の訪問は同じ時刻に重ねる
      // どの訪問も、前の訪問（または出動）から移動して着ける時刻より前には置かない。入らなければ赤い枠
      type Blk = { s: Schedule | null; from: number; to: number; pos: LatLng | null; lunch?: boolean };
      const blocks: Blk[] = [{ s: null, from: depart, to: depart, pos: base }];
      const leg = (a: Blk, b: Schedule, bPos: LatLng | null) =>
        a.s && (sameBuilding(a.s, b) || isSameSite(a.pos, bPos)) ? 0 : travelLeg(a.pos ?? base, bPos, mode).min;
      // t より前に終わっている最後の訪問（なければ出動）と、その間の昼休憩
      const prevOf = (t: number) => {
        const done = blocks.filter(b => b.to <= t);
        const visit = done.filter(b => !b.lunch).sort((a, b) => b.to - a.to)[0] ?? blocks[0];
        const lunchAfter = done.find(b => b.lunch && b.from >= visit.to);
        return { visit, lunchAfter };
      };
      const findSlot = (x: Schedule, pos: LatLng | null, earliest: number) => {
        // 同じ建物・同じ敷地の訪問が先に置いてあれば、同じ時刻に重ねる（まとめて対応）
        const sameSite = blocks.find(b => b.s && b.from >= earliest - WORK_MIN && (sameBuilding(b.s, x) || isSameSite(b.pos, pos)));
        if (sameSite) return sameSite.from;
        let t = earliest;
        for (let guard = 0; guard < 60; guard++) {
          const { visit, lunchAfter } = prevOf(t);
          const need = Math.max(visit.to + leg(visit, x, pos), lunchAfter ? lunchAfter.to : -Infinity);
          if (t < need) {
            t = need;
            continue;
          }
          const hit = blocks.find(b => t < b.to && t + WORK_MIN > b.from && b.to > b.from);
          if (hit) {
            t = hit.to;
            continue;
          }
          // 次に押さえてある訪問へ間に合うか
          const next = blocks.filter(b => !b.lunch && b.s && b.from >= t + WORK_MIN).sort((a, b) => a.from - b.from)[0];
          if (next && next.s && t + WORK_MIN + leg({ s: x, from: t, to: t + WORK_MIN, pos }, next.s, next.pos) > next.from) {
            t = next.to;
            continue;
          }
          return t;
        }
        return t;
      };
      const startOf = new Map<Schedule, number>();
      const put = (x: Schedule, t: number) => {
        startOf.set(x, t);
        blocks.push({ s: x, from: t, to: t + WORK_MIN, pos: posOf(x) });
      };
      const withSlot = g.items.map((x, idx) => ({ x, idx, slot: parseTimeSlot(x.target_time) }));
      const isAm = (sl: ReturnType<typeof parseTimeSlot>) => sl?.kind === 'band' && sl.from < LUNCH_FROM;
      // ① 時刻指定
      withSlot.filter(w => w.slot?.kind === 'at').sort((a, b) => a.slot!.from - b.slot!.from).forEach(w => put(w.x, w.slot!.from));
      // ② AM
      withSlot.filter(w => isAm(w.slot)).forEach(w => put(w.x, findSlot(w.x, posOf(w.x), w.slot!.from)));
      // ③ PM
      withSlot.filter(w => w.slot?.kind === 'band' && !isAm(w.slot)).forEach(w => put(w.x, findSlot(w.x, posOf(w.x), w.slot!.from)));
      // ④ 時間指定なし・「〜迄」（行の順に空いた所へ）
      withSlot.filter(w => !w.slot || w.slot.kind === 'until').forEach(w => put(w.x, findSlot(w.x, posOf(w.x), depart)));

      // 時刻の早い順に並べ、昼休憩を入れる（12:00 以降、最初に 60 分空いたところ。空きが無ければその後の訪問を後ろへずらす）
      const chrono = withSlot.map(w => ({ ...w, start: startOf.get(w.x)! })).sort((a, b) => a.start - b.start || a.idx - b.idx);
      const legBetween = (prev: { x: Schedule } | null, x: Schedule) => {
        if (!prev) return travelLeg(base, posOf(x), mode);
        if (sameBuilding(prev.x, x) || isSameSite(posOf(prev.x), posOf(x))) return { min: 0, kind: 'same' as LegKind };
        return travelLeg(posOf(prev.x) ?? base, posOf(x), mode);
      };
      let lunch: [number, number] | null = null;
      // 昼休憩のあとの訪問を、時刻指定の訪問を避けながら前へ詰める（昼が移動込み 80 分を超えないように）
      const compactFrom = (i: number, pvStart: (typeof chrono)[number] | null, cursorStart: number) => {
        const fixedAt = chrono.filter(c => c.slot?.kind === 'at');
        let cursor = cursorStart;
        let pv = pvStart;
        for (let j = i; j < chrono.length; j++) {
          const c = chrono[j];
          if (c.slot?.kind === 'at') {
            cursor = Math.max(cursor, c.start + WORK_MIN);
            pv = c;
            continue;
          }
          const lg = legBetween(pv, c.x);
          let cand = lg.kind === 'same' && pv ? pv.start : Math.max(cursor + lg.min, c.slot?.kind === 'band' ? c.slot.from : -Infinity);
          for (let guard = 0; guard < 10; guard++) {
            const hit = fixedAt.find(f => f !== c && legBetween(f, c.x).kind !== 'same' && cand < f.start + WORK_MIN && cand + WORK_MIN + legBetween(c, f.x).min > f.start);
            if (!hit) break;
            cand = hit.start + WORK_MIN + legBetween(hit, c.x).min;
          }
          c.start = cand;
          cursor = Math.max(cursor, cand + WORK_MIN);
          pv = c;
        }
        chrono.sort((x1, x2) => x1.start - x2.start || x1.idx - x2.idx);
      };
      {
        let prev: (typeof chrono)[number] | null = null;
        let prevEnd = depart;
        for (let i = 0; i < chrono.length && !lunch; i++) {
          const w = chrono[i];
          const mv = legBetween(prev, w.x).min;
          const moveFrom = w.start - mv;
          if (prev && w.start >= prevEnd) {
            const span = lunchSpan(mv);
            if (w.start - prevEnd >= span && moveFrom > LUNCH_FROM) {
              // この訪問の前の空きで取る（できるだけ 12:00 から）
              const lsStart = Math.max(prevEnd, Math.min(LUNCH_FROM, w.start - span));
              lunch = [lsStart, lsStart + span - mv];
              compactFrom(i, prev, lunch[1]);
            } else if ((w.start >= LUNCH_FROM || prevEnd >= LUNCH_FROM) && w.slot?.kind !== 'at') {
              // 空きが足りない: 昼休憩のあとに移動して始める（時刻指定の訪問の前なら、その後の空きで取る）
              const lsStart = Math.max(prevEnd, LUNCH_FROM);
              lunch = [lsStart, lsStart + span - mv];
              compactFrom(i, prev, lunch[1]);
            }
          }
          if (w.start + WORK_MIN > prevEnd) {
            prevEnd = w.start + WORK_MIN;
            prev = w;
          }
        }
      }

      // 出動の記録が無ければ、1 件目に着く時刻から逆算して出る（最初に待ちを作らない）
      const firstLeg = chrono[0] ? legBetween(null, chrono[0].x).min : 0;
      const departShown = departRec ?? (chrono[0] ? chrono[0].start - firstLeg : depart);
      // 移動・待ちを前の訪問から出し直す
      let prevW: (typeof chrono)[number] | null = null;
      let prevEnd = departShown;
      const placed: Placed[] = [];
      for (const w of chrono) {
        const lg = legBetween(prevW, w.x);
        const sameAsPrev = lg.kind === 'same' && !!prevW;
        const start = w.start;
        const end = start + WORK_MIN;
        const lunchBetween = !!lunch && lunch[0] >= prevEnd && lunch[1] <= start - lg.min;
        const waitFrom = lunchBetween && lunch ? lunch[1] : prevEnd;
        const arrive = waitFrom + lg.min;
        const sl = w.slot;
        const late = !!sl && ((sl.kind === 'at' && arrive > sl.from && !sameAsPrev) || (sl.kind !== 'at' && end > sl.to));
        if (end > prevEnd) {
          prevEnd = end;
          prevW = w;
        }
        placed.push({ schedule: w.x, no: w.idx + 1, start, end, estimated: !sl, late, move: lg.min, legKind: lg.kind, waitFrom, stackIndex: 0, stackSize: 1, stackKey: String(w.x.id), stackLabel: String(w.idx + 1) });
      }
      // 昼休憩は、その後に訪問があるときだけ出す
      if (lunch && !placed.some(p => p.start >= lunch![1])) lunch = null;
      // 番号は実際に回る順（時刻の早い順）。行動予定表の行の順と違っても、時間軸では回る順で数える
      [...placed].sort((a, b) => a.start - b.start || a.no - b.no).forEach((p, k) => {
        p.no = k + 1;
      });
      const live = g.items.filter(x => x.status !== 'cancelled');
      const bestOrder = [...planRoute(live, posOf, base, depart, mode), ...g.items.filter(x => x.status === 'cancelled')];
      const travelNow = totalTravel(live, posOf, base, mode);
      const travelBest = totalTravel(bestOrder.filter(x => x.status !== 'cancelled'), posOf, base, mode);
      // 時間が重なる訪問は、行の高さを変えずに少しずつずらして重ねる（カーソルを乗せると前に出る）
      let group: Placed[] = [];
      let groupEnd = -Infinity;
      const closeGroup = () => group.forEach((p, k) => {
        p.stackIndex = k;
        p.stackSize = group.length;
        p.stackKey = `${g.key}@${Math.min(...group.map(x => x.start))}`;
        const nos = group.map(x => x.no);
        p.stackLabel = group.length > 1 ? `${Math.min(...nos)}〜${Math.max(...nos)}` : String(p.no);
      });
      [...placed].sort((a, b) => a.start - b.start).forEach(p => {
        if (p.start >= groupEnd) {
          closeGroup();
          group = [];
        }
        group.push(p);
        groupEnd = Math.max(groupEnd, p.end);
      });
      closeGroup();
      out.push({
        key: g.key,
        name: g.name,
        member: g.member,
        course: g.course,
        placed,
        depart: departShown,
        departRecorded: departRec != null,
        travelNow,
        travelBest,
        bestOrder,
        mode,
        lunch,
        done: g.items.filter(x => x.result === '完了').length,
        live: g.items.filter(x => x.status !== 'cancelled').length,
      });
    }
    // 時間軸は自社の技術員（マスタに登録のある人）だけ。協力会社・担当未定は出さない
    return out.filter(r => r.member).sort((a, b) => a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff, feEvents, date, sitePos, reservations, homeBase]);

  // 実績（FE のボタン記録・開始/完了時刻）
  const actuals = useMemo(() => {
    const byId = new Map<number | string, { move?: [number, number | null]; work?: [number, number | null] }>();
    const evs = feEvents.filter(e => e.work_date === date && e.schedule_id != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    // 出動（勤務開始）の時刻（担当ごと）。出動後に出発を押さずに着いた訪問は、出動から移動していたとみなす
    const shiftAt = new Map<number, number>();
    for (const e of feEvents.filter(x => x.work_date === date && x.kind === 'shift_start').sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
      const m = hmToMin(jstHm(e.occurred_at));
      if (m != null && !shiftAt.has(e.staff_id)) shiftAt.set(e.staff_id, m);
    }
    const firstArrived = new Set<number>();
    for (const e of evs) {
      const v = byId.get(e.schedule_id!) || {};
      const m = hmToMin(jstHm(e.occurred_at));
      if (m == null) continue;
      if (e.kind === 'depart') {
        // 1 件目の出発は、出動（拠点を出た時刻）が先にあればそこから
        const sh = shiftAt.get(e.staff_id);
        v.move = [!firstArrived.has(e.staff_id) && sh != null && sh < m ? sh : m, null];
      }
      if (e.kind === 'arrive') {
        if (!v.move && !firstArrived.has(e.staff_id) && shiftAt.has(e.staff_id)) v.move = [shiftAt.get(e.staff_id)!, null];
        firstArrived.add(e.staff_id);
        if (v.move && v.move[1] == null) v.move[1] = m;
        v.work = [m, null];
      }
      if (e.kind === 'finish' && v.work) v.work[1] = m;
      byId.set(e.schedule_id!, v);
    }
    for (const s of schedules) {
      if (byId.get(s.id)?.work) continue;
      const st = hmToMin(s.started_at);
      if (st == null) continue;
      byId.set(s.id, { ...(byId.get(s.id) || {}), work: [st, hmToMin(s.completed_at)] });
    }
    return byId;
  }, [feEvents, schedules, date]);

  // 時間軸に出さない予定（協力会社・担当未定）
  const hiddenCount = schedules.filter(x => x.status !== 'cancelled' && !(staff.find(st => st.id === x.staff_id) ?? findStaffByName(staff, x.staff_name))).length;
  if (rows.length === 0) return <div className="lane-empty">登録された予定はありません</div>;

  let start = 8 * 60;
  let end = 19 * 60;
  for (const r of rows) start = Math.min(start, Math.floor(r.depart / 60) * 60);
  for (const r of rows) for (const p of r.placed) {
    start = Math.min(start, Math.floor(p.start / 60) * 60);
    end = Math.max(end, Math.ceil(p.end / 60) * 60);
  }
  end = Math.min(end, 24 * 60);
  const span = end - start;
  const pct = (m: number) => ((Math.min(Math.max(m, start), end) - start) / span) * 100;
  const hours: number[] = [];
  for (let m = start; m < end; m += 60) hours.push(m);
  const isToday = date === todayStr();
  const showNow = isToday && now > start && now < end;

  // 近い順に並べ替え（時間指定は守る）。順番は sort_order に保存（お試しモードではこの端末の中だけ）
  const canRoute = canEdit && !!onReorder;
  const improvable = rows.filter(r => r.travelBest < r.travelNow && r.bestOrder.some((x, i) => x.id !== r.placed[i]?.schedule.id));
  const applyRoute = async (targets: Row[]) => {
    if (!onReorder || busy || targets.length === 0) return;
    setBusy(true);
    try {
      for (const r of targets) await onReorder(r.bestOrder.map((x, i) => ({ id: x.id, sort_order: i })));
    } catch (e) {
      alert(e instanceof Error ? e.message : '並べ替えられませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stl-board">
      <div className="stl-legend">
        <span><i className="stl-lg is-confirmed" />確定</span>
        <span><i className="stl-lg is-draft" />仮</span>
        <span><i className="stl-lg is-free" />通常</span>
        <span><i className="stl-lg is-est" />時間指定なし（順番から出した見込み）</span>
        <span><i className="stl-lg is-depart" />出動（勤務開始。記録が無ければ 9:00 の見込み）</span>
        <span><i className="stl-lg is-late" />指定の時刻・締切に間に合わない見込み</span>
        <span><CarFront size={12} /><TrainFront size={12} /><Footprints size={12} />移動の見込み（車／電車・バス／徒歩）</span>
        <span><i className="stl-lg is-move" />移動（実績）</span>
        <span><i className="stl-lg is-work" />作業（実績）</span>
        {showNow && <span><i className="stl-lg is-now" />いま</span>}
        <span className="stl-note">出動から 1 件 {WORK_MIN} 分・移動は距離からの見込み（Fun-navi の予約がある人・専用車の人は車、それ以外は電車・徒歩）＋10 分で置いています{reservations == null && '（予約を読めないため専用車の人だけ車）'}{hiddenCount > 0 && `。協力会社・${UNASSIGNED}の ${hiddenCount} 件はカード表示だけに出しています`}</span>
        {canRoute && (
          <button
            type="button"
            className="stl-route-all"
            onClick={() => void applyRoute(improvable)}
            disabled={busy || improvable.length === 0}
            title={improvable.length ? `${improvable.length} 人の順番を、時間指定を守って移動が短くなる順にします` : '並べ替えで短くなる人はいません'}
          >
            <Route size={14} />
            近い順に並べ替え{improvable.length > 0 && <b className="stl-num">{improvable.length}人</b>}
          </button>
        )}
      </div>

      <div className="stl-head">
        <span className="stl-head-person">担当</span>
        <span className="stl-head-axis">
          {hours.map(h => (
            <span key={h} className="stl-tick" style={{ left: `${pct(h)}%` }}>{fmt(h)}</span>
          ))}
        </span>
      </div>

      {rows.map(r => (
        <div key={r.key} className="lane-row stl-row">
          <div className="lane-person">
            <StaffAvatar member={r.member} name={r.name} size={30} />
            <span className="lane-person-text">
              <span className="lane-name">{r.name}</span>
              <span className="lane-meta"><b>{r.live}</b>件・完了 <b>{r.done}</b></span>
              <span className="lane-meta stl-travel">
                <span title={`今の順番で回ったときの移動の合計（${r.mode === 'car' ? '車' : '電車・徒歩'}）`}>
                  {r.mode === 'car' ? <CarFront size={12} /> : <TrainFront size={12} />} <b>{r.travelNow}</b>分
                </span>
                {canRoute && r.travelBest < r.travelNow && (
              <button
                type="button"
                className="stl-route-btn"
                onClick={() => void applyRoute([r])}
                disabled={busy}
                title={`近い順に並べ替える（時間指定は守る）
移動 ${r.travelNow}分 → ${r.travelBest}分`}
                aria-label="近い順に並べ替える"
              >
                  <Route size={12} />
                  <b>-{r.travelNow - r.travelBest}</b>
                </button>
                )}
              </span>
            </span>
          </div>
          <div className="stl-track" style={{ height: TRACK_H }}>
            {hours.map(h => <span key={h} className="stl-grid" style={{ left: `${pct(h)}%` }} />)}
            <span
              className={`stl-depart${r.departRecorded ? '' : ' is-est'}`}
              style={{ left: `${pct(r.depart)}%` }}
              title={r.departRecorded ? `${fmt(r.depart)} 出動（勤務開始）` : `出動の記録なし（${fmt(r.depart)} 出動の見込み）`}
            >
              出動
            </span>
            {r.lunch && (
              <span
                className="stl-lunch"
                style={{ left: `${pct(r.lunch[0])}%`, width: `${pct(r.lunch[1]) - pct(r.lunch[0])}%`, top: MOVE_Y }}
                title={`昼休憩 ${fmt(r.lunch[0])}〜${fmt(r.lunch[1])}（移動を含めて最大 80 分）`}
              >
                <span>
                  <UtensilsCrossed size={10} />
                  昼
                </span>
              </span>
            )}
            {r.placed.map(p => {
              const s = p.schedule;
              const meta = statusMeta(s.status);
              const time = normalizeTargetTime(s.target_time);
              const progress = progressOf(s, feEvents);
              const isDone = progress === 'done';
              const lock = typeof s.id === 'number' ? activeLocks[s.id] : undefined;
              const act = actuals.get(s.id);
              // 重なり: ふだんは少しずつずらして重ね、クリックでその組だけ横に並べて広げる（ほかのカード・行は動かさない）
              const k = p.stackIndex;
              const isSpread = p.stackSize > 1 && spread === p.stackKey;
              const w = pct(p.end) - pct(p.start);
              const shift = isSpread ? 0 : Math.min(k, STACK_MAX) * STACK_SHIFT;
              const top = CARD_TOP + shift;
              const left = isSpread ? `calc(${pct(p.start)}% + ${k} * (${w}% + 2px))` : `calc(${pct(p.start)}% + ${shift}px)`;
              const barTop = BAR_Y;
              const LegIcon = LEG_ICON[p.legKind];
              const moveFrom = p.start - p.move;
              const wait = moveFrom - p.waitFrom;
              return (
                <React.Fragment key={s.id}>
                {p.stackIndex === 0 && wait >= 15 && (
                  <span
                    className="stl-wait"
                    style={{ left: `${pct(p.waitFrom)}%`, width: `${pct(moveFrom) - pct(p.waitFrom)}%`, top: MOVE_Y }}
                    title={`待ち ${fmtDur(wait)}（${time || ''} の指定に合わせて出る見込み）`}
                  >
                    <span>待ち {fmtDur(wait)}</span>
                  </span>
                )}
                {p.move > 0 && p.stackIndex === 0 && (
                  <span
                    className={`stl-move leg-${p.legKind}`}
                    style={{ left: `${pct(moveFrom)}%`, width: `${pct(p.start) - pct(moveFrom)}%`, top: MOVE_Y }}
                    title={`移動 ${p.move} 分の見込み（${LEG_LABEL[p.legKind]}・余裕 10 分を含む）`}
                  >
                    <span>
                      {LegIcon && <LegIcon size={11} />}
                      {p.move}分
                    </span>
                  </span>
                )}
                <div
                  className={`lane-card stl-card tone-${meta.tone} p-${progress}${isDone ? ' is-done' : ''}${p.estimated ? ' is-est' : ''}${p.late ? ' is-late' : ''}${k > 0 && !isSpread ? ' is-stacked' : ''}${p.stackSize > 1 ? ' in-stack' : ''}${isSpread ? ' is-spread' : ''}`}
                  style={{ left, width: `calc(${w}% - 4px)`, top, zIndex: isSpread ? 30 + k : 1 + k }}
                  draggable={isSpread && canEdit && !!onReorder}
                  onDragStart={e => {
                    setDragId(s.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => {
                    if (isSpread && dragId != null && dragId !== s.id) e.preventDefault();
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    if (!onReorder || dragId == null || dragId === s.id) return;
                    // 広げた組の中で、落とした位置へ入れ替える（行全体の順番として保存）
                    const list = r.placed.map(x => x.schedule);
                    const from = list.findIndex(x => x.id === dragId);
                    const to = list.findIndex(x => x.id === s.id);
                    if (from < 0 || to < 0) return;
                    const [moved] = list.splice(from, 1);
                    list.splice(to, 0, moved);
                    setDragId(null);
                    void onReorder(list.map((x, i) => ({ id: x.id, sort_order: i })));
                  }}
                  onDragEnd={() => setDragId(null)}
                  onClick={e => {
                    // 重なっているときは 1 クリックで横に広げる／閉じる（ダブルクリックの 2 回目は数えない）
                    if (p.stackSize < 2 || e.detail > 1) return;
                    setSpread(sp => (sp === p.stackKey ? null : p.stackKey));
                  }}
                  onContextMenu={e => {
                    if (!onSetProgress) return;
                    e.preventDefault();
                    setMenu({ s, x: e.clientX, y: e.clientY });
                  }}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    if (lock) {
                      alert(`現在、${lock.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
                      return;
                    }
                    onOpenEditModal(s);
                  }}
                  title={`${p.no}. ${time || '時間指定なし'}（${p.estimated ? '見込み ' : ''}${fmt(p.start)}〜${fmt(p.end)}）${p.late ? '\n赤い枠: 指定の時刻・締切に間に合わない見込み' : ''}\n${s.unit_number || ''} ${s.property_name}\n${s.work_type || ''} ${s.description || ''}${p.stackSize > 1 ? (isSpread ? '\n広げた中はドラッグで並べ替え' : '\nクリックで重なりを広げる') : ''}${canEdit ? '\nダブルクリックで編集' : ''}${onSetProgress ? '\n右クリックで対応状況を変える' : ''}`}
                >
                  <VisitCardBody
                    schedule={s}
                    no={p.no}
                    noLabel={p.stackSize > 1 && !isSpread && k === p.stackSize - 1 ? p.stackLabel : undefined}
                    progress={progress}
                    lock={!!lock}
                    place={placeOf(s)}
                    grip={isSpread && canEdit && !!onReorder}
                  />
                  {k === p.stackSize - 1 && p.stackSize > 1 && !isSpread && (
                    <span className="stl-stack-count" title={`この時間帯に ${p.stackSize} 件重なっています。クリックで横に広げます`}>{p.stackSize}件</span>
                  )}
                </div>
                {act?.move && (
                  <span
                    className={`stl-actual is-move${act.move[1] == null && isToday ? ' is-live' : ''}`}
                    style={{ left: `${pct(act.move[0])}%`, width: `${Math.max(0.4, pct(act.move[1] ?? (isToday ? now : act.move[0] + 10)) - pct(act.move[0]))}%`, top: barTop }}
                    title={`移動 ${fmt(act.move[0])}〜${act.move[1] != null ? fmt(act.move[1]) : ''}`}
                  />
                )}
                {act?.work && (
                  <span
                    className={`stl-actual is-work${act.work[1] == null && isToday ? ' is-live' : ''}`}
                    style={{ left: `${pct(act.work[0])}%`, width: `${Math.max(0.4, pct(act.work[1] ?? (isToday ? now : act.work[0] + 10)) - pct(act.work[0]))}%`, top: barTop }}
                    title={`作業 ${fmt(act.work[0])}〜${act.work[1] != null ? fmt(act.work[1]) : ''}`}
                  />
                )}
                </React.Fragment>
              );
            })}
            {showNow && <span className="stl-now" style={{ left: `${pct(now)}%` }} />}
          </div>
        </div>
      ))}
      {menu && onSetProgress && (
        <ProgressMenu
          at={{ x: menu.x, y: menu.y }}
          title={`${menu.s.unit_number || ''} ${menu.s.property_name}`.trim()}
          current={progressOf(menu.s, feEvents)}
          onSelect={p => onSetProgress(menu.s, p)}
          loadHistory={loadMenuHistory}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};
