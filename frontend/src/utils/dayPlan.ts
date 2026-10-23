import { useMemo } from 'react';
import type { Schedule, Staff } from '../types';
import { jstHm, type FeEvent } from './feEvents';
import type { LatLng } from './geocode';
import { isSameSite, sameBuilding, travelLeg, travelModeOf, useHomeBase, useSitePositions, WORK_MIN, type LegKind, type TravelMode } from './route';
import { hmToMin, parseTimeSlot } from './scheduleDisplay';
import { useFunnaviReservations, usesVehicle, type FunnaviReservation } from './vehicleUsers';
import { isHoliday, workTone } from './timeline/workTone';

// 1 人の 1 日の訪問を時間の軸に置く（行動予定のガントと予定表の時間軸で共通）。
// 時間の指定を守る順に枠を押さえ、移動は訪問先の位置（号機 → 物件マスタの住所）からの距離で見積もり、昼休憩を入れる。

export const DAY_START = 9 * 60;
/** 昼休憩 60 分（12:00 以降、最初に手が空いたところで取る。移動を含めて最大 80 分） */
export const LUNCH_FROM = 12 * 60;
export const LUNCH_MIN = 60;
/** 昼休憩は移動を含めて最大 80 分（移動が 20 分を超える分は休憩の中で動く） */
export const LUNCH_WITH_MOVE_MAX = 80;
/** 昼休憩の始まりから次の訪問を始めるまでの時間（移動 mv 分を含む） */
export const lunchSpan = (mv: number) => Math.max(mv, Math.min(LUNCH_MIN + mv, LUNCH_WITH_MOVE_MAX));
export interface PlannedVisit {
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

export interface DayPlan {
  placed: PlannedVisit[];
  /** 昼休憩（取った位置）。その後に訪問が無ければ null */
  lunch: [number, number] | null;
  /** 置くときに使った出動の時刻（記録が無ければ 9:00 か、早い時刻指定に間に合う時刻） */
  depart: number;
  /** 画面に出す出動の時刻（記録が無ければ 1 件目に着く時刻から逆算） */
  departShown: number;
}

export interface PlanInput {
  /** その人のその日の予定（行動予定表の並び順に並べてから渡す） */
  items: Schedule[];
  posOf: (s: Schedule) => LatLng | null;
  /** 出発地（出動を押した場所、無ければその人の拠点） */
  base: LatLng | null;
  mode: TravelMode;
  /** 出動（勤務開始）の記録の時刻 */
  departRec?: number;
  /** 拠点で行う予定（社内）。出動からそのまま始めるので 1 件目でも移動なし */
  atBase?: (s: Schedule) => boolean;
}

/** 物件名も号機も無い予定、または種別が社内・ミーティングなどは社内（拠点で行う） */
export const isInOffice = (s: Schedule) =>
  (!(s.property_name || '').trim() && !(s.unit_number || '').trim()) || (workTone(s.work_type) === 'internal' && !isHoliday(s));

export const planStaffDay = ({ items, posOf, base, mode, departRec, atBase }: PlanInput): DayPlan => {
  const fromBase = (x: Schedule) => (atBase?.(x) ? { min: 0, kind: 'same' as LegKind } : travelLeg(base, posOf(x), mode));
  const g = { items };
  // 出動の記録が無ければ 9:00 の見込み。ただし 1 件目が 8:00 指定などなら、間に合うように早めに出たとみなす
  const firstNeed = Math.min(
    Infinity,
    ...g.items.map(x => {
      const sl = parseTimeSlot(x.target_time);
      return sl && sl.kind !== 'until' && sl.from < LUNCH_FROM ? sl.from - fromBase(x).min : Infinity;
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
    a.s && (sameBuilding(a.s, b) || isSameSite(a.pos, bPos)) ? 0 : !a.s ? fromBase(b).min : travelLeg(a.pos ?? base, bPos, mode).min;
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
    if (!prev) return fromBase(x);
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
  const placed: PlannedVisit[] = [];
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

  return { placed, lunch, depart, departShown };
};

/** 置くのに要る、その日の材料（訪問先の位置・拠点・Fun-navi の予約・出動の記録） */
export interface DayPlanContext {
  date: string;
  feEvents: FeEvent[];
  sitePos: Record<string, LatLng | null>;
  homeBase: (staffName: string) => LatLng | null;
  /** Fun-navi の予約（読めなければ null。そのときは専用車の人だけ車） */
  reservations: FunnaviReservation[] | null;
  /** 名簿の苗字（予約の名前から人を当てるのに使う） */
  knownSurnames: string[];
}

export const useDayPlanContext = (schedules: Schedule[], staff: Staff[], date: string, feEvents: FeEvent[]): DayPlanContext => {
  const sitePos = useSitePositions(schedules);
  const homeBase = useHomeBase();
  const reservations = useFunnaviReservations(date);
  const knownSurnames = useMemo(() => staff.map(st => st.name.trim().split(/\s+/)[0]).filter(n => n.length >= 1), [staff]);
  return useMemo(() => ({ date, feEvents, sitePos, homeBase, reservations, knownSurnames }), [date, feEvents, sitePos, homeBase, reservations, knownSurnames]);
};

export interface PersonDayPlan extends DayPlan {
  base: LatLng | null;
  posOf: (s: Schedule) => LatLng | null;
  mode: TravelMode;
  departRec: number | undefined;
}

/** 1 人分: 出動の記録（無ければ拠点・9:00 の見込み）と移動の手段を決めてから置く。items は並び順に並べて渡す */
export const planPersonDay = (name: string, member: Staff | undefined, items: Schedule[], ctx: DayPlanContext): PersonDayPlan => {
  // 出動（勤務開始）して拠点を出たところから移動が始まる。1 件目は出動＋移動の後ろ
  const shiftEv = member
    ? ctx.feEvents
        .filter(e => e.staff_id === member.id && e.work_date === ctx.date && e.kind === 'shift_start')
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0]
    : undefined;
  const departRec = shiftEv ? hmToMin(jstHm(shiftEv.occurred_at)) ?? undefined : undefined;
  // 出発地: 出動を押した場所。記録が無ければその人の拠点（既定は岩本町、北新横浜の人もいる）から
  const base: LatLng | null = shiftEv?.lat != null && shiftEv?.lng != null ? { lat: shiftEv.lat, lng: shiftEv.lng } : ctx.homeBase(name);
  // 物件名・号機の無い予定は社内（拠点にいる）。1 件目なら移動なし、現場からなら拠点まで移動する
  const posOf = (x: Schedule) => (isInOffice(x) ? base : ctx.sitePos[(x.unit_number || '').trim()] ?? null);
  // 移動の手段: 車両の基本利用者（または交通手段が車）なら車、それ以外は電車・徒歩
  const mode = travelModeOf(items, usesVehicle(name, ctx.reservations, ctx.knownSurnames));
  return { ...planStaffDay({ items, posOf, base, mode, departRec, atBase: isInOffice }), base, posOf, mode, departRec };
};
