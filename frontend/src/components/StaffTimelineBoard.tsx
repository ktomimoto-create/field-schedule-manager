import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CarFront, Footprints, Info, Route, TrainFront, UtensilsCrossed } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, findScheduleStaff, normalizeTargetTime } from '../types';
import { hmToMin, progressOf, statusMeta } from '../utils/scheduleDisplay';
import { jstHm, type FeEvent } from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import { UNASSIGNED, VisitCardBody } from './StaffLaneBoard';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import { ProgressMenu, type StatusHistoryItem } from './ProgressMenu';
import type { Progress } from '../utils/scheduleDisplay';
import { planRoute, totalTravel, WORK_MIN, type LegKind, type TravelMode } from '../utils/route';
import { planPersonDay, type DayPlanContext, type PlannedVisit } from '../utils/dayPlan';
import './StaffLaneBoard.css';
import './StaffTimelineBoard.css';

// 予定表の時間軸（カード表示を基にした形）: 1 人 1 行、左に担当、右に時間の軸。
// 訪問カードを時刻の位置に置く。時間の指定が無い訪問は、出動から順番どおりに 1 件 60 分・移動（距離からの見込み＋10 分）で並べた「見込み」の位置（点線の枠）。
// 「近い順に並べ替え」で、時間指定を守りながら移動が短くなる順番にする。
// カードの下の細い帯は実績（青＝移動、緑＝作業）。

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

/** 重ねたカードをずらす量（px）。3 枚目以降は同じ位置 */
const STACK_SHIFT = 6;
const STACK_MAX = 2;
/** カードの下に、移動・待ちの見込み（点線）と実績（帯）を置く。重なりの有無で線の高さが変わらないように固定の位置 */
/** 1 時間の幅（px）。訪問 1 件（60 分）のカードが、カード表示と同じ 210px（＋すき間 4px）になる幅。
 *  切り替えてもカードの大きさが変わらず、物件名もカード表示と同じだけ読める。画面に入らなければ横にスクロール */
const HOUR_W = 214;
const PERSON_W = 150;
const CARD_H = 86;
// 線はカードの上に置く（カードは重なっても上端がずれないので、どの行も同じ高さに並ぶ）
const MOVE_Y = 10;
const BAR_Y = 17;
const CARD_TOP = 26;
const TRACK_H = CARD_TOP + CARD_H + STACK_SHIFT * STACK_MAX + 6;

const LEG_ICON: Partial<Record<LegKind, typeof CarFront>> = { car: CarFront, train: TrainFront, walk: Footprints };
const LEG_LABEL: Record<LegKind, string> = { car: '車', train: '電車・バスと徒歩', walk: '徒歩', same: '同じ建物', unknown: '位置が分からないため 15 分' };
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);

type Placed = PlannedVisit;

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
  /** 時間の置き方の材料（GridView が 1 つ持ち、カード表示と使い回す。切り替えのたびに読み直さない） */
  planCtx: DayPlanContext;
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

export const StaffTimelineBoard: React.FC<Props> = ({ schedules, staff, date, planCtx, canEdit, activeLocks, onOpenEditModal, onReorder, feEvents = [], onSetProgress, loadStatusHistory }) => {
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
  const reservations = planCtx.reservations;
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
      const member = findScheduleStaff(staff, s);
      const name = member ? member.name : s.staff_name || UNASSIGNED;
      const key = member ? `id-${member.id}` : `n-${name}`;
      if (!map.has(key)) {
        const c = Number(member?.default_course ?? s.course);
        map.set(key, { key, name, member, course: Number.isFinite(c) && String(member?.default_course ?? s.course ?? '').trim() !== '' ? c : Infinity, items: [] });
      }
      map.get(key)!.items.push(s);
    }
    const out: Row[] = [];
    for (const g of map.values()) {
      g.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
      const { placed: planned, lunch, depart, departShown, base, posOf, mode, departRec } = planPersonDay(g.name, g.member, g.items, planCtx);
      const placed: Placed[] = planned;
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
    // カード表示と同じ行・同じ順（自社の技術員をコース順 → 協力会社など → 担当未定）。切り替えても行が動かないようにする
    const rank = (r: Row) => (r.member ? 0 : r.name === UNASSIGNED ? 2 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff, feEvents, date, planCtx]);

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

  const legendText = [
    '見方',
    '・点線の枠: 時間指定なし（順番から出した見込みの位置）',
    '・赤い枠: 指定の時刻・締切に間に合わない見込み',
    '・青い縦線「出動」: 勤務開始（記録が無ければ 9:00 の見込み）',
    '・カードの上の点線: 移動の見込み（車／電車・バス／徒歩）',
    '・カードの上の帯: 青＝移動（実績）、緑＝作業（実績）',
    ...(showNow ? ['・赤い縦線: いま'] : []),
    `出動から 1 件 ${WORK_MIN} 分・移動は距離からの見込み（Fun-navi の予約がある人・専用車の人は車、それ以外は電車・徒歩）＋10 分で置いています${reservations == null ? '（予約を読めないため専用車の人だけ車）' : ''}`,
  ].join('\n');

  return (
    <div className="stl-board" style={{ minWidth: PERSON_W + hours.length * HOUR_W + 32 }}>
      {/* 見出しはカード表示と同じ高さの 1 行（凡例は ⓘ に乗せると出る）。切り替えても行の位置が動かないようにする */}
      <div className="lane-head stl-head">
        <span className="lane-head-person">
          担当
          <span className="stl-legend-tip" title={legendText}>
            <Info size={12} />
          </span>
          {canRoute && (
            <button
              type="button"
              className="stl-route-all"
              onClick={() => void applyRoute(improvable)}
              disabled={busy || improvable.length === 0}
              title={improvable.length ? `近い順に並べ替え: ${improvable.length} 人の順番を、時間指定を守って移動が短くなる順にします` : '近い順に並べ替え: 短くなる人はいません'}
              aria-label="近い順に並べ替え"
            >
              <Route size={12} />
              {improvable.length > 0 && <b className="stl-num">{improvable.length}</b>}
            </button>
          )}
        </span>
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
                {/* 待ち: 線が途切れないよう点線は必ず引き、15 分以上は「待ち ◯分」（ガントと同じ） */}
                {p.stackIndex === 0 && wait > 0 && p.legKind !== 'same' && (
                  <span
                    className="stl-wait"
                    style={{ left: `${pct(p.waitFrom)}%`, width: `${pct(moveFrom) - pct(p.waitFrom)}%`, top: MOVE_Y }}
                    title={`待ち ${fmtDur(wait)}（${time || ''} の指定に合わせて出る見込み）`}
                  >
                    {wait >= 15 && <span>待ち {fmtDur(wait)}</span>}
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
                  data-sid={String(s.id)}
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
