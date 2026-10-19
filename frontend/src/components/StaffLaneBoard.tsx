import React, { useCallback, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, ClipboardList, HardHat, Lock, PackagePlus, Repeat2, Tag, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, findStaffByName, normalizeTargetTime } from '../types';
import { progressOf, statusMeta, summarizeDescription, workTypeKey, type Progress } from '../utils/scheduleDisplay';
import type { FeEvent } from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import { ProgressMenu, type StatusHistoryItem } from './ProgressMenu';
import './StaffLaneBoard.css';

/** 担当が入っていない予定のまとめ */
export const UNASSIGNED = '担当未定';

const PROGRESS_LABEL: Record<Progress, string> = { todo: '未着手', working: '対応中', done: '完了' };

/** 種別のアイコン（色は種類ごと。赤・緑は使わない）。名前はカーソルを乗せると出る */
const WT_ICON: Record<string, LucideIcon> = {
  fault: TriangleAlert,
  second: Repeat2,
  approved: BadgeCheck,
  construct: HardHat,
  install: PackagePlus,
  periodic: CalendarClock,
  survey: ClipboardList,
  other: Tag,
};

/** 訪問カードの中身（カード表示と時間軸で共通）:
 *  1 行目 番号・号機・時間指定 ／ 2 行目 種別のアイコン・物件名 ／ 3 行目 作業内容の要約 ／ 4 行目 エリア・県別
 *  番号の丸の色が対応状況（未着手＝紫・対応中＝赤・完了＝緑）。種別は種類ごとの色のアイコン。「必ず」はオレンジ。仮の予定は点線の枠 */
export const VisitCardBody: React.FC<{ schedule: Schedule; no: number; noLabel?: string; progress: Progress; lock?: boolean; timeOverride?: string; grip?: boolean; place?: string }> = ({ schedule: s, no, noLabel, progress, lock, timeOverride, grip, place: placeProp }) => {
  const time = normalizeTargetTime(s.target_time);
  const summary = summarizeDescription(s.description);
  const place = placeProp ?? [s.prefecture, s.area].filter(Boolean).join(' ');
  const wtKey = workTypeKey(s.work_type);
  const WtIcon = WT_ICON[wtKey];
  void grip; // ドラッグはカード全体で受ける（つまみのアイコンは出さない）
  return (
    <>
      <div className="lane-card-top">
        <span className={`lane-no p-${progress}`} title={PROGRESS_LABEL[progress]}>{noLabel ?? no}</span>
        <span className="lane-unit">{s.unit_number || ''}</span>
        {time === '必ず' ? <span className="lane-must">必ず</span> : (time || timeOverride) ? <span className={`lane-time${time ? ' is-set' : ''}`}>{time || timeOverride}</span> : null}
        {lock && <Lock size={12} className="lane-lock" />}
      </div>
      <div className="lane-property-row">
        {s.work_type && WtIcon && (
          <span className={`lane-wt-icon wt-${wtKey}`} title={s.work_type} aria-label={s.work_type}>
            <WtIcon size={12} />
          </span>
        )}
        <span className="lane-property">{s.property_name}</span>
      </div>
      <div className="lane-summary-line">{summary || '\u00a0'}</div>
      <div className="lane-place">{place || '\u00a0'}</div>
    </>
  );
};

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
  feEvents?: FeEvent[];
  /** 対応状況を変える（管理側。カードの右クリック） */
  onSetProgress?: (s: Schedule, p: Progress) => Promise<void>;
  loadStatusHistory?: (s: Schedule) => Promise<StatusHistoryItem[]>;
}

interface Lane {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  items: Schedule[];
}

export const StaffLaneBoard: React.FC<Props> = ({ schedules, staff, canEdit, activeLocks, onOpenEditModal, onReorder, feEvents = [], onSetProgress, loadStatusHistory }) => {
  const [drag, setDrag] = useState<{ lane: string; id: number | string } | null>(null);
  const [overId, setOverId] = useState<number | string | null>(null);
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

  const lanes = useMemo<Lane[]>(() => {
    const map = new Map<string, Lane>();
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
    for (const l of map.values()) l.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
    // 自社の技術員（マスタに登録のある人）をコース順 → 協力会社など → 担当未定
    const rank = (l: Lane) => (l.member ? 0 : l.name === UNASSIGNED ? 2 : 1);
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.course - b.course || a.name.localeCompare(b.name, 'ja'));
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
                <span className="lane-name">{lane.name}</span>
                <span className="lane-meta"><b>{live}</b>件・完了 <b>{done}</b></span>
              </span>
            </div>
            <div className="lane-cards">
              {lane.items.map((s, idx) => {
                const meta = statusMeta(s.status);
                const time = normalizeTargetTime(s.target_time);
                const progress = progressOf(s, feEvents);
                const isDone = progress === 'done';
                const lock = typeof s.id === 'number' ? activeLocks[s.id] : undefined;
                const draggable = canEdit && !!onReorder && !lock;
                return (
                  <div
                    key={s.id}
                    className={`lane-card tone-${meta.tone} p-${progress}${isDone ? ' is-done' : ''}${overId === s.id && drag?.lane === lane.key ? ' is-drop' : ''}`}
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
                    title={`${idx + 1}. ${time || '時間指定なし'} ${s.unit_number || ''} ${s.property_name}\n${s.work_type || ''} ${s.description || ''}\n${canEdit ? 'ダブルクリックで編集・ドラッグで並べ替え・右クリックで対応状況' : ''}`}
                  >
                    <VisitCardBody schedule={s} no={idx + 1} progress={progress} lock={!!lock} grip={draggable} place={placeOf(s)} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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
      <div className="lane-summary">
        担当 <b>{lanes.length}</b>人 ・ 訪問 <b>{totalVisits}</b>件 ・ 完了 <b>{doneVisits}</b>件
      </div>
    </div>
  );
};
