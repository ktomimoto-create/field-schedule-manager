import React, { useEffect, useMemo, useState } from 'react';
import { CarFront, Footprints, Route, TrainFront } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, normalizeTargetTime } from '../types';
import { hmToMin, parseTimeSlot, progressOf, statusMeta } from '../utils/scheduleDisplay';
import { jstHm, type FeEvent } from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import { VisitCardBody } from './StaffLaneBoard';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import { isSameSite, planRoute, sameBuilding, totalTravel, travelLeg, travelModeOf, useSitePositions, WORK_MIN, type LegKind, type TravelMode } from '../utils/route';
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

export const StaffTimelineBoard: React.FC<Props> = ({ schedules, staff, date, canEdit, activeLocks, onOpenEditModal, onReorder, feEvents = [] }) => {
  const [now, setNow] = useState(nowMin);
  const placeOf = usePlaceLabel(schedules);
  const sitePos = useSitePositions(schedules);
  const reservations = useFunnaviReservations(date);
  const [busy, setBusy] = useState(false);
  // 横に広げている重なりの組（クリックで広げる・もう一度か外をクリックで閉じる）
  const [spread, setSpread] = useState<string | null>(null);
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
      const member = staff.find(st => st.id === s.staff_id);
      const name = member ? member.name : s.staff_name || '未設定';
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
      // 拠点の位置: 出動を押した場所（分からなければ 1 件目の移動は 25 分の見込み）
      const base: LatLng | null = shiftEv?.lat != null && shiftEv?.lng != null ? { lat: shiftEv.lat, lng: shiftEv.lng } : null;
      const posOf = (x: Schedule) => sitePos[(x.unit_number || '').trim()] ?? null;
      // 移動の手段: 車両の基本利用者（または交通手段が車）なら車、それ以外は電車・徒歩
      const mode = travelModeOf(g.items, usesVehicle(g.name, reservations, knownSurnames));
      // 出動の記録が無ければ 9:00 の見込み。ただし 1 件目が 8:00 指定などなら、間に合うように早めに出たとみなす
      const firstSlot = g.items[0] ? parseTimeSlot(g.items[0].target_time) : null;
      const firstNeed = firstSlot && firstSlot.kind !== 'until' ? firstSlot.from - travelLeg(base, posOf(g.items[0]), mode).min : Infinity;
      const depart = departRec ?? Math.min(DAY_START, firstNeed);
      // 順番どおりに時刻を割り当てる（前の場所から移動して着いた時刻。時刻指定はその時刻、〜迄・AM/PM は枠の始まりより前には始めない）
      let cursor = depart;
      let here: LatLng | null = base;
      let prevS: Schedule | null = null;
      const placed: Placed[] = g.items.map((s, i) => {
        const slot = parseTimeSlot(s.target_time);
        const pos = posOf(s);
        const same = sameBuilding(prevS, s) || isSameSite(here, pos);
        const leg = same ? { min: 0, kind: 'same' as LegKind } : travelLeg(here, pos, mode);
        const move = leg.min;
        prevS = s;
        const waitFrom = cursor;
        const arrive = cursor + move;
        let start: number;
        let estimated = false;
        if (!slot) {
          start = arrive;
          estimated = true;
        } else if (slot.kind === 'at') {
          start = slot.from;
        } else {
          start = Math.max(arrive, slot.from);
        }
        const end = start + WORK_MIN;
        const late = !!slot && ((slot.kind === 'until' && end > slot.to) || (slot.kind === 'at' && arrive > slot.from && !same));
        cursor = Math.max(cursor, end);
        here = pos ?? here;
        return { schedule: s, no: i + 1, start, end, estimated, late, move, legKind: leg.kind, waitFrom, stackIndex: 0, stackSize: 1, stackKey: String(s.id) };
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
        p.stackKey = String(group[0].schedule.id);
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
        depart,
        departRecorded: departRec != null,
        travelNow,
        travelBest,
        bestOrder,
        mode,
        done: g.items.filter(x => x.result === '完了').length,
        live: g.items.filter(x => x.status !== 'cancelled').length,
      });
    }
    return out.sort((a, b) => a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff, feEvents, date, sitePos, reservations]);

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
        <span className="stl-note">出動から 1 件 {WORK_MIN} 分・移動は距離からの見込み（Fun-navi の予約がある人・専用車の人は車、それ以外は電車・徒歩）＋10 分で置いています{reservations == null && '（予約を読めないため専用車の人だけ車）'}</span>
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
                  onClick={e => {
                    // 重なっているときは 1 クリックで横に広げる／閉じる（ダブルクリックの 2 回目は数えない）
                    if (p.stackSize < 2 || e.detail > 1) return;
                    setSpread(sp => (sp === p.stackKey ? null : p.stackKey));
                  }}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    if (lock) {
                      alert(`現在、${lock.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
                      return;
                    }
                    onOpenEditModal(s);
                  }}
                  title={`${p.no}. ${time || '時間指定なし'}（${p.estimated ? '見込み ' : ''}${fmt(p.start)}〜${fmt(p.end)}）${p.late ? '\n赤い枠: 指定の時刻・締切に間に合わない見込み' : ''}\n${s.unit_number || ''} ${s.property_name}\n${s.work_type || ''} ${s.description || ''}${canEdit ? '\nダブルクリックで編集' : ''}`}
                >
                  <VisitCardBody schedule={s} no={p.no} progress={progress} lock={!!lock} timeOverride={fmt(p.start)} place={placeOf(s)} />
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
    </div>
  );
};
