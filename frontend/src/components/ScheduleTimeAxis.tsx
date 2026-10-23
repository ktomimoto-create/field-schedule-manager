import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { getShortName } from '../types';
import { parseTimeSlot, hmToMin, statusMeta, type TimeSlot } from '../utils/scheduleDisplay';
import { DayScheduleCards, StaffAvatar } from './ScheduleCards';
import { jstHm, type FeEvent } from '../utils/feEvents';
import './ScheduleTimeAxis.css';

// 予定表の「時間軸」表示（FE動態の予実ボードと同じ形）:
// 担当ごとに 1 行、上段=予定（指定時間から置いた枠）、下段=実績（開始〜完了）。行を押すとその人の予定カードが開く。

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

interface Props {
  schedules: Schedule[];
  staff: Staff[];
  date: string;
  canEdit: boolean;
  activeLocks: Record<number, LockInfo>;
  onOpenEditModal: (s: Schedule) => void;
  onToggleComplete: (s: Schedule) => void;
  /** FE のボタン記録。出発〜到着を「移動」として実績の段に出す */
  feEvents?: FeEvent[];
}

interface PlacedBar {
  schedule: Schedule;
  slot: TimeSlot;
  lane: number;
}

interface PersonRow {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  items: Schedule[];
  bars: PlacedBar[];
  laneCount: number;
  untimed: Schedule[];
  doneCount: number;
}

const fmt = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ScheduleTimeAxis: React.FC<Props> = ({ schedules, staff, date, canEdit, activeLocks, onOpenEditModal, onToggleComplete, feEvents = [] }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo<PersonRow[]>(() => {
    const map = new Map<string, PersonRow>();
    for (const s of schedules) {
      const member = staff.find(st => st.id === s.staff_id);
      const name = member ? member.name : s.staff_name || '';
      const key = member ? `id-${member.id}` : name ? `name-${name}` : 'unassigned';
      if (!map.has(key)) {
        const courseNum = Number(member?.default_course ?? s.course);
        map.set(key, {
          key,
          name: name || '未設定',
          member,
          course: Number.isFinite(courseNum) && String(member?.default_course ?? s.course ?? '').trim() !== '' ? courseNum : Infinity,
          items: [],
          bars: [],
          laneCount: 1,
          untimed: [],
          doneCount: 0,
        });
      }
      map.get(key)!.items.push(s);
    }
    for (const row of map.values()) {
      const timed: { schedule: Schedule; slot: TimeSlot }[] = [];
      for (const s of row.items) {
        if (s.result === '完了') row.doneCount++;
        const slot = parseTimeSlot(s.target_time);
        if (slot) timed.push({ schedule: s, slot });
        else row.untimed.push(s);
      }
      // 重なる枠は段をずらして置く（左から詰める）
      timed.sort((a, b) => a.slot.from - b.slot.from);
      const laneEnds: number[] = [];
      for (const t of timed) {
        let lane = laneEnds.findIndex(end => end <= t.slot.from);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(0);
        }
        laneEnds[lane] = t.slot.to;
        row.bars.push({ ...t, lane });
      }
      row.laneCount = Math.max(1, laneEnds.length);
    }
    return [...map.values()].sort((a, b) => a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff]);

  // 予定ごとの移動（最後の出発 → その後の到着）。分は JST の 0:00 から
  const moves = useMemo(() => {
    const out = new Map<number | string, { from: number; to: number | null; fromLabel: string; toLabel: string }>();
    const evs = [...feEvents].filter(e => e.work_date === date && e.schedule_id != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (const e of evs) {
      if (e.kind === 'depart') {
        out.set(e.schedule_id!, { from: hmToMin(jstHm(e.occurred_at))!, to: null, fromLabel: jstHm(e.occurred_at), toLabel: '' });
      } else if (e.kind === 'arrive') {
        const m = out.get(e.schedule_id!);
        if (m && m.to == null) {
          m.to = hmToMin(jstHm(e.occurred_at));
          m.toLabel = jstHm(e.occurred_at);
        }
      }
    }
    return out;
  }, [feEvents, date]);

  const range = useMemo(() => {
    let start = 8 * 60;
    let end = 19 * 60;
    for (const r of rows) {
      for (const b of r.bars) {
        start = Math.min(start, Math.floor(b.slot.from / 60) * 60);
        end = Math.max(end, Math.ceil(b.slot.to / 60) * 60);
      }
      for (const s of r.items) {
        const mv = moves.get(s.id);
        for (const v of [hmToMin(s.started_at), hmToMin(s.completed_at), mv ? mv.from : null]) {
          if (v == null) continue;
          start = Math.min(start, Math.floor(v / 60) * 60);
          end = Math.max(end, Math.ceil(v / 60) * 60);
        }
      }
    }
    return { start: Math.max(0, start), end: Math.min(24 * 60, end) };
  }, [rows, moves]);

  const span = range.end - range.start;
  const pos = (min: number) => ((Math.min(Math.max(min, range.start), range.end) - range.start) / span) * 100;
  const hours: number[] = [];
  for (let m = range.start; m < range.end; m += 60) hours.push(m);

  const isToday = date === todayStr();
  const showNow = isToday && now > range.start && now < range.end;

  if (rows.length === 0) {
    return <div className="sc-empty">登録された予定はありません</div>;
  }

  return (
    <div className="ta-wrap">
      <div className="ta-legend">
        <span><i className="ta-lg ta-lg-confirmed" />確定</span>
        <span><i className="ta-lg ta-lg-draft" />仮</span>
        <span><i className="ta-lg ta-lg-free" />通常</span>
        <span><i className="ta-lg ta-lg-until" />〜迄（締切）</span>
        <span><i className="ta-lg ta-lg-move" />移動（出発〜到着）</span>
        <span><i className="ta-lg ta-lg-actual" />作業（到着〜完了）</span>
        {showNow && <span><i className="ta-lg ta-lg-now" />いま</span>}
        <span className="ta-note">終了時刻は登録が無いため、時刻指定は1時間・AM は 9〜12 時・PM は 13〜17 時の枠で置いています</span>
      </div>

      <div className="ta-board">
        <div className="ta-row ta-head">
          <span className="ta-name">担当</span>
          <span className="ta-time">
            {hours.map(h => (
              <span key={h} className="ta-tick sc-num" style={{ left: `${pos(h)}%` }}>{fmt(h)}</span>
            ))}
          </span>
          <span className="ta-untimed">時間指定なし</span>
          <span className="ta-done">完了</span>
        </div>

        {rows.map(r => {
          const open = openKey === r.key;
          const planHeight = r.laneCount * 20;
          return (
            <Fragment key={r.key}>
              <div
                className={`ta-row ta-body${open ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : r.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenKey(open ? null : r.key);
                  }
                }}
              >
                <span className="ta-name">
                  <StaffAvatar member={r.member} name={r.name} size={28} />
                  <span className="ta-person">{r.member ? getShortName(r.name) : r.name}</span>
                  <ChevronDown size={16} className="ta-chevron" />
                </span>
                <span className="ta-time" style={{ minHeight: planHeight + 34 }}>
                  {hours.map(h => <span key={h} className="ta-grid" style={{ left: `${pos(h)}%` }} />)}
                  {r.bars.map(b => {
                    const meta = statusMeta(b.schedule.status);
                    const label = b.schedule.unit_number || b.schedule.property_name || b.schedule.work_type || '';
                    return (
                      <button
                        type="button"
                        key={b.schedule.id}
                        className={`ta-bar tone-${meta.tone} kind-${b.slot.kind}${b.schedule.result === '完了' ? ' is-done' : ''}`}
                        style={{ left: `${pos(b.slot.from)}%`, width: `${Math.max(0.6, pos(b.slot.to) - pos(b.slot.from))}%`, top: 6 + b.lane * 20 }}
                        title={`${b.slot.label} ${b.schedule.unit_number || ''} ${b.schedule.property_name}\n${b.schedule.work_type || ''} ${b.schedule.description || ''}\n状態: ${meta.label}${b.schedule.result === '完了' ? '・完了' : ''}`}
                        onClick={e => {
                          e.stopPropagation();
                          if (!canEdit) return;
                          const lock = typeof b.schedule.id === 'number' ? activeLocks[b.schedule.id] : undefined;
                          if (lock) {
                            alert(`現在、${lock.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
                            return;
                          }
                          onOpenEditModal(b.schedule);
                        }}
                      >
                        <span className="ta-bar-label">{label}</span>
                      </button>
                    );
                  })}
                  {r.items.map(s => {
                    const mv = moves.get(s.id);
                    if (!mv) return null;
                    const live = mv.to == null && isToday;
                    const to = mv.to ?? (live ? now : mv.from + 10);
                    return (
                      <span
                        key={`m-${s.id}`}
                        className={`ta-move${live ? ' is-live' : ''}`}
                        style={{ left: `${pos(mv.from)}%`, width: `${Math.max(0.6, pos(to) - pos(mv.from))}%`, top: planHeight + 12 }}
                        title={`移動 ${mv.fromLabel}〜${mv.toLabel} ${s.unit_number || ''} ${s.property_name}`}
                      />
                    );
                  })}
                  {r.items.map(s => {
                    const st = hmToMin(s.started_at);
                    if (st == null) return null;
                    const ed = hmToMin(s.completed_at);
                    const live = ed == null && isToday;
                    const to = ed ?? (live ? now : st + 15);
                    return (
                      <span
                        key={`a-${s.id}`}
                        className={`ta-actual${live ? ' is-live' : ''}`}
                        style={{ left: `${pos(st)}%`, width: `${Math.max(0.6, pos(to) - pos(st))}%`, top: planHeight + 12 }}
                        title={`実績 ${s.started_at}〜${s.completed_at || ''} ${s.unit_number || ''} ${s.property_name}`}
                      />
                    );
                  })}
                  {showNow && <span className="ta-now" style={{ left: `${pos(now)}%` }} />}
                </span>
                <span className="ta-untimed">
                  {r.untimed.length === 0 ? (
                    <span className="sc-muted">—</span>
                  ) : (
                    r.untimed.map(s => (
                      <span key={s.id} className={`ta-chip tone-${statusMeta(s.status).tone}`} title={`${s.target_time || '時間指定なし'} ${s.unit_number || ''} ${s.property_name}`}>
                        {s.target_time ? <b>{s.target_time}</b> : null}
                        {s.unit_number || s.property_name || s.work_type || '（未定）'}
                      </span>
                    ))
                  )}
                </span>
                <span className={`ta-done sc-num${r.doneCount === 0 ? ' is-dim' : ''}`}>{r.doneCount}/{r.items.length}</span>
              </div>
              {open && (
                <div className="ta-detail">
                  <DayScheduleCards
                    schedules={r.items}
                    staff={staff}
                    canEdit={canEdit}
                    activeLocks={activeLocks}
                    onOpenEditModal={onOpenEditModal}
                    onToggleComplete={onToggleComplete}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
};
