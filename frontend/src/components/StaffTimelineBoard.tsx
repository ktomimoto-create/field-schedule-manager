import React, { useEffect, useMemo, useState } from 'react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, normalizeTargetTime } from '../types';
import { hmToMin, parseTimeSlot, progressOf, statusMeta } from '../utils/scheduleDisplay';
import { jstHm, type FeEvent } from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import { VisitCardBody } from './StaffLaneBoard';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import './StaffLaneBoard.css';
import './StaffTimelineBoard.css';

// 予定表の時間軸（カード表示を基にした形）: 1 人 1 行、左に担当、右に時間の軸。
// 訪問カードを時刻の位置に置く。時間の指定が無い訪問は、順番どおりに 1 件 60 分・移動 15 分で並べた「見込み」の位置（点線の枠）。
// カードの下の細い帯は実績（青＝移動、緑＝作業）。

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

const WORK_MIN = 60;
const MOVE_MIN = 15;
const DAY_START = 9 * 60;
const LANE_H = 98;

interface Placed {
  schedule: Schedule;
  no: number;
  start: number;
  end: number;
  estimated: boolean;
  late: boolean;
  lane: number;
}

interface Row {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  placed: Placed[];
  lanes: number;
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

export const StaffTimelineBoard: React.FC<Props> = ({ schedules, staff, date, canEdit, activeLocks, onOpenEditModal, feEvents = [] }) => {
  const [now, setNow] = useState(nowMin);
  const placeOf = usePlaceLabel(schedules);
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
    const out: Row[] = [];
    for (const g of map.values()) {
      g.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
      // 順番どおりに時刻を割り当てる（指定がある訪問はその時刻、無い訪問は前の訪問の後ろ）
      let cursor = DAY_START;
      const placed: Placed[] = g.items.map((s, i) => {
        const slot = parseTimeSlot(s.target_time);
        let start: number;
        let estimated = false;
        if (!slot) {
          start = cursor;
          estimated = true;
        } else if (slot.kind === 'at') {
          start = slot.from;
        } else {
          start = Math.max(cursor, slot.from);
        }
        const end = start + WORK_MIN;
        const late = !!slot && slot.kind === 'until' && end > slot.to;
        cursor = Math.max(cursor, end + MOVE_MIN);
        return { schedule: s, no: i + 1, start, end, estimated, late, lane: 0 };
      });
      // 重なるカードは段をずらす
      const laneEnds: number[] = [];
      [...placed].sort((a, b) => a.start - b.start).forEach(p => {
        let lane = laneEnds.findIndex(e => e <= p.start);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(0);
        }
        laneEnds[lane] = p.end;
        p.lane = lane;
      });
      out.push({
        key: g.key,
        name: g.name,
        member: g.member,
        course: g.course,
        placed,
        lanes: Math.max(1, laneEnds.length),
        done: g.items.filter(x => x.result === '完了').length,
        live: g.items.filter(x => x.status !== 'cancelled').length,
      });
    }
    return out.sort((a, b) => a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff]);

  // 実績（FE のボタン記録・開始/完了時刻）
  const actuals = useMemo(() => {
    const byId = new Map<number | string, { move?: [number, number | null]; work?: [number, number | null] }>();
    const evs = feEvents.filter(e => e.work_date === date && e.schedule_id != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (const e of evs) {
      const v = byId.get(e.schedule_id!) || {};
      const m = hmToMin(jstHm(e.occurred_at));
      if (m == null) continue;
      if (e.kind === 'depart') v.move = [m, null];
      if (e.kind === 'arrive') {
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

  return (
    <div className="stl-board">
      <div className="stl-legend">
        <span><i className="stl-lg is-confirmed" />確定</span>
        <span><i className="stl-lg is-draft" />仮</span>
        <span><i className="stl-lg is-free" />通常</span>
        <span><i className="stl-lg is-est" />時間指定なし（順番から出した見込み）</span>
        <span><i className="stl-lg is-move" />移動（実績）</span>
        <span><i className="stl-lg is-work" />作業（実績）</span>
        {showNow && <span><i className="stl-lg is-now" />いま</span>}
        <span className="stl-note">1 件 {WORK_MIN} 分・移動 {MOVE_MIN} 分として置いています</span>
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
            </span>
          </div>
          <div className="stl-track" style={{ height: r.lanes * LANE_H + 12 }}>
            {hours.map(h => <span key={h} className="stl-grid" style={{ left: `${pct(h)}%` }} />)}
            {r.placed.map(p => {
              const s = p.schedule;
              const meta = statusMeta(s.status);
              const time = normalizeTargetTime(s.target_time);
              const progress = progressOf(s, feEvents);
              const isDone = progress === 'done';
              const lock = typeof s.id === 'number' ? activeLocks[s.id] : undefined;
              const act = actuals.get(s.id);
              const barTop = 6 + p.lane * LANE_H + LANE_H - 9;
              return (
                <React.Fragment key={s.id}>
                <div
                  className={`lane-card stl-card tone-${meta.tone} p-${progress}${isDone ? ' is-done' : ''}${p.estimated ? ' is-est' : ''}${p.late ? ' is-late' : ''}`}
                  style={{ left: `${pct(p.start)}%`, width: `calc(${pct(p.end) - pct(p.start)}% - 4px)`, top: 6 + p.lane * LANE_H }}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    if (lock) {
                      alert(`現在、${lock.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
                      return;
                    }
                    onOpenEditModal(s);
                  }}
                  title={`${p.no}. ${time || '時間指定なし'}（${p.estimated ? '見込み ' : ''}${fmt(p.start)}〜${fmt(p.end)}）${p.late ? ' 締切に間に合わない見込み' : ''}\n${s.unit_number || ''} ${s.property_name}\n${s.work_type || ''} ${s.description || ''}${canEdit ? '\nダブルクリックで編集' : ''}`}
                >
                  <VisitCardBody schedule={s} no={p.no} progress={progress} lock={!!lock} timeOverride={fmt(p.start)} place={placeOf(s)} />
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
