import React, { useMemo, useState } from 'react';
import { CheckCircle2, GripVertical, Lock } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, getShortName, normalizeTargetTime } from '../types';
import { statusMeta } from '../utils/scheduleDisplay';
import { StaffAvatar } from './ScheduleCards';
import './StaffLaneBoard.css';

// 予定表のカード表示（配車計画のリスト表示を手本にした形）:
// 1 人 1 行。左に担当（顔・名前・件数・完了数）、右にその日の訪問を順番どおり横に並べる。
// カードはドラッグで並べ替えられる（同じ人の行の中だけ）。ダブルクリック／鉛筆で編集。

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

interface Props {
  schedules: Schedule[];
  staff: Staff[];
  canEdit: boolean;
  activeLocks: Record<number, LockInfo>;
  onOpenEditModal: (s: Schedule) => void;
  onReorder?: (orders: { id: number | string; sort_order: number }[]) => Promise<void>;
}

interface Lane {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  items: Schedule[];
}

export const StaffLaneBoard: React.FC<Props> = ({ schedules, staff, canEdit, activeLocks, onOpenEditModal, onReorder }) => {
  const [drag, setDrag] = useState<{ lane: string; id: number | string } | null>(null);
  const [overId, setOverId] = useState<number | string | null>(null);

  const lanes = useMemo<Lane[]>(() => {
    const map = new Map<string, Lane>();
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
    for (const l of map.values()) l.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
    return [...map.values()].sort((a, b) => a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff]);

  if (lanes.length === 0) return <div className="lane-empty">登録された予定はありません</div>;

  const totalVisits = schedules.filter(s => s.status !== 'cancelled').length;
  const doneVisits = schedules.filter(s => s.result === '完了').length;

  const drop = async (lane: Lane, targetId: number | string) => {
    if (!drag || drag.lane !== lane.key || drag.id === targetId || !onReorder) return;
    const list = [...lane.items];
    const from = list.findIndex(x => x.id === drag.id);
    const to = list.findIndex(x => x.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await onReorder(list.map((x, i) => ({ id: x.id, sort_order: i })));
  };

  return (
    <div className="lane-board">
      {lanes.map(lane => {
        const done = lane.items.filter(x => x.result === '完了').length;
        const live = lane.items.filter(x => x.status !== 'cancelled').length;
        return (
          <div key={lane.key} className="lane-row">
            <div className="lane-person">
              <StaffAvatar member={lane.member} name={lane.name} size={30} />
              <span className="lane-person-text">
                <span className="lane-name">{lane.member ? getShortName(lane.name) : lane.name}</span>
                <span className="lane-meta"><b>{live}</b>件・完了 <b>{done}</b></span>
              </span>
            </div>
            <div className="lane-cards">
              {lane.items.map((s, idx) => {
                const meta = statusMeta(s.status);
                const time = normalizeTargetTime(s.target_time);
                const isDone = s.result === '完了';
                const lock = typeof s.id === 'number' ? activeLocks[s.id] : undefined;
                const draggable = canEdit && !!onReorder && !lock;
                return (
                  <div
                    key={s.id}
                    className={`lane-card tone-${meta.tone}${isDone ? ' is-done' : ''}${overId === s.id && drag?.lane === lane.key ? ' is-drop' : ''}`}
                    draggable={draggable}
                    onDragStart={e => {
                      setDrag({ lane: lane.key, id: s.id });
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={e => {
                      if (drag?.lane === lane.key) {
                        e.preventDefault();
                        setOverId(s.id);
                      }
                    }}
                    onDragLeave={() => setOverId(o => (o === s.id ? null : o))}
                    onDrop={e => {
                      e.preventDefault();
                      setOverId(null);
                      void drop(lane, s.id);
                      setDrag(null);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOverId(null);
                    }}
                    onDoubleClick={() => {
                      if (!canEdit) return;
                      if (lock) {
                        alert(`現在、${lock.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
                        return;
                      }
                      onOpenEditModal(s);
                    }}
                    title={`${idx + 1}. ${time || '時間指定なし'} ${s.unit_number || ''} ${s.property_name}\n${s.work_type || ''} ${s.description || ''}\n${canEdit ? 'ダブルクリックで編集・ドラッグで並べ替え' : ''}`}
                  >
                    <div className="lane-card-top">
                      {draggable && <GripVertical size={12} className="lane-grip" />}
                      <span className="lane-no">{idx + 1}</span>
                      <span className={`lane-time${time === '必ず' ? ' is-must' : ''}`}>{time || '—'}</span>
                      <span className="lane-unit">{s.unit_number || ''}</span>
                      {isDone && <CheckCircle2 size={12} className="lane-done" />}
                      {lock && <Lock size={12} className="lane-lock" />}
                    </div>
                    <div className="lane-property">{s.property_name}</div>
                    <div className="lane-card-bottom">
                      {s.work_type && <span className="lane-badge">{s.work_type}</span>}
                      <span className="lane-area">{s.area || ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="lane-summary">
        担当 <b>{lanes.length}</b>人 ・ 訪問 <b>{totalVisits}</b>件 ・ 完了 <b>{doneVisits}</b>件
      </div>
    </div>
  );
};
