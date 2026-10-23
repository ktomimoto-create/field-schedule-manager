import React, { useCallback, useMemo, useState } from 'react';
import { BadgeCheck, ClipboardList, HardHat, Lock, PackagePlus, Repeat2, Stethoscope, Tag } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { compareSchedules, findScheduleStaff, normalizeTargetTime } from '../types';
import { progressOf, statusMeta, summarizeDescription, workTypeKey, type Progress } from '../utils/scheduleDisplay';
import type { FeEvent } from '../utils/feEvents';
import { planPersonDay, type DayPlanContext } from '../utils/dayPlan';
import { StaffAvatar } from './ScheduleCards';
import { usePlaceLabel } from '../utils/usePlaceLabel';
import { ProgressMenu, type StatusHistoryItem } from './ProgressMenu';
import './StaffLaneBoard.css';

/** 担当が入っていない予定のまとめ */
export const UNASSIGNED = '担当未定';

const PROGRESS_LABEL: Record<Progress, string> = { todo: '未着手', working: '対応中', done: '完了' };

/** ドライバーとスパナ（アフタートラブル＝障害）。lucide に無いので同じ線の太さで描く */
const ScrewdriverWrench: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {/* スパナ（右上 → 左下） */}
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 7.9-7.9z" />
    {/* ドライバー（左上 → 右下） */}
    <path d="M3 3l2 2" />
    <path d="M5 5l6 6" />
    <path d="M13 13l2.5-1 5.6 5.6a1.8 1.8 0 0 1-2.5 2.5L13 14.5z" />
  </svg>
);

/** 種別のアイコン（色は種類ごと。赤・緑は使わない）。名前はカーソルを乗せると出る
 *  障害（アフタートラブル）＝ドライバーとスパナ／工事（コンストラクション）＝ヘルメット／定期・保守＝診断 */
const WT_ICON: Record<string, React.FC<{ size?: number }>> = {
  fault: ScrewdriverWrench,
  second: Repeat2,
  approved: BadgeCheck,
  construct: HardHat,
  install: PackagePlus,
  periodic: Stethoscope,
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
  /** 時間軸と同じ「時刻の指定を守る順」に並べるための材料（GridView が 1 つ持ち、時間軸と使い回す） */
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

interface Lane {
  key: string;
  name: string;
  member?: Staff;
  course: number;
  items: Schedule[];
}

const NO_EVENTS: FeEvent[] = [];

export const StaffLaneBoard: React.FC<Props> = ({ schedules, staff, planCtx, canEdit, activeLocks, onOpenEditModal, onReorder, feEvents = NO_EVENTS, onSetProgress, loadStatusHistory }) => {
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
      const member = findScheduleStaff(staff, s);
      const name = member ? member.name : s.staff_name || UNASSIGNED;
      const key = member ? `id-${member.id}` : `n-${name}`;
      if (!map.has(key)) {
        const c = Number(member?.default_course ?? s.course);
        map.set(key, { key, name, member, course: Number.isFinite(c) && String(member?.default_course ?? s.course ?? '').trim() !== '' ? c : Infinity, items: [] });
      }
      map.get(key)!.items.push(s);
    }
    for (const l of map.values()) {
      l.items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
      // 時間軸と同じ「時刻の指定を守る順」（実際に回る順）に並べ、番号もそろえる。切り替えてもカードの順番が入れ替わらない
      const planned = [...planPersonDay(l.name, l.member, l.items, planCtx).placed].sort((a, b) => a.no - b.no).map(p => p.schedule);
      const rest = l.items.filter(x => !planned.includes(x));
      l.items = [...planned, ...rest];
    }
    // 自社の技術員（マスタに登録のある人）をコース順 → 協力会社など → 担当未定
    const rank = (l: Lane) => (l.member ? 0 : l.name === UNASSIGNED ? 2 : 1);
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.course - b.course || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff, planCtx]);

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
      {/* 時間軸と同じ高さの見出し行（切り替えても行の位置が動かないように） */}
      <div className="lane-head">
        <span className="lane-head-person">担当</span>
        <span className="lane-head-note">訪問（順番どおり）</span>
      </div>
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
                    data-sid={String(s.id)}
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
