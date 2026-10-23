import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Lock, Pencil } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { getShortName, cleanMetadata, splitCoWorkers, normalizeTargetTime } from '../types';
import { statusMeta } from '../utils/scheduleDisplay';
import './ScheduleCards.css';

// 予定のカード表示（予定表の当日一覧と、月間予定表の日ごとの列で使う）

type LockInfo = { userEmail: string; userName: string; startedAt: number; sessionId?: string; mode?: string };

export const StaffAvatar: React.FC<{ member?: Staff; name: string; size?: number }> = ({ member, name, size = 22 }) => {
  if (member?.avatar_url) {
    return <img className="sc-avatar" src={member.avatar_url} alt={name} style={{ width: size, height: size }} />;
  }
  const prefix = name.match(/^(FE|SF|FR)/i);
  return (
    <span className={`sc-avatar sc-avatar-initial${member ? '' : ' is-unknown'}`} style={{ width: size, height: size, fontSize: prefix ? size * 0.36 : size * 0.48 }}>
      {prefix ? prefix[1].toUpperCase() : getShortName(name).substring(0, 1)}
    </span>
  );
};

const StaffCell: React.FC<{ schedule: Schedule; staff: Staff[] }> = ({ schedule, staff }) => {
  const member = staff.find(st => st.id === schedule.staff_id);
  const name = member ? member.name : schedule.staff_name || '';
  if (!name) return <span className="sc-muted">未設定</span>;
  return (
    <span className="sc-staff" title={name}>
      <StaffAvatar member={member} name={name} />
      <span className="sc-staff-name">{getShortName(name)}</span>
    </span>
  );
};

const CoWorkers: React.FC<{ schedule: Schedule; staff: Staff[] }> = ({ schedule, staff }) => {
  const list = splitCoWorkers(schedule.co_worker || '', staff);
  if (list.length === 0) return <span className="sc-muted">—</span>;
  return (
    <span className="sc-coworkers">
      {list.map((n, i) => (
        <span key={i} className="sc-coworker">{getShortName(n)}</span>
      ))}
    </span>
  );
};

const lockAlert = (lock?: LockInfo) =>
  alert(`現在、${lock?.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);

/* ---------------- 予定表（当日）のカード一覧 ---------------- */

interface DayScheduleCardsProps {
  schedules: Schedule[];
  staff: Staff[];
  canEdit: boolean;
  activeLocks: Record<number, LockInfo>;
  onOpenEditModal: (s: Schedule) => void;
  onToggleComplete: (s: Schedule) => void;
}

export const DayScheduleCards: React.FC<DayScheduleCardsProps> = ({ schedules, staff, canEdit, activeLocks, onOpenEditModal, onToggleComplete }) => {
  const [openId, setOpenId] = useState<number | string | null>(null);

  if (schedules.length === 0) {
    return <div className="sc-empty">登録された予定はありません</div>;
  }

  return (
    <div className="sc-list">
      <div className="sc-row sc-head">
        <span />
        <span className="sc-c">時間</span>
        <span>号機</span>
        <span>物件名 / 作業内容</span>
        <span className="sc-c">種別</span>
        <span>対応者</span>
        <span>同行者</span>
        <span>エリア</span>
        <span>依頼番号</span>
        <span className="sc-c">結果</span>
        <span />
      </div>
      {schedules.map(s => {
        const meta = statusMeta(s.status);
        const lock = typeof s.id === 'number' ? activeLocks[s.id] : undefined;
        const isDone = s.result === '完了';
        const isOpen = openId === s.id;
        const time = normalizeTargetTime(s.target_time);
        const notes = cleanMetadata(s.notes);
        const openEdit = () => {
          if (!canEdit) return;
          if (lock) return lockAlert(lock);
          onOpenEditModal(s);
        };
        return (
          <div key={s.id} className={`sc-card tone-${meta.tone}${isDone ? ' is-done' : ''}${isOpen ? ' is-open' : ''}`}>
            <div
              className="sc-row sc-body"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : s.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(isOpen ? null : s.id);
                }
              }}
              onDoubleClick={openEdit}
            >
              <span className="sc-dot" title={meta.label} />
              <span className={`sc-time sc-num sc-c${time === '必ず' ? ' is-must' : ''}`}>{time || '—'}</span>
              <span className="sc-unit sc-num">{s.unit_number || '—'}</span>
              <span className="sc-title">
                <span className="sc-property">
                  {s.property_name}
                  {lock && (
                    <span className="sc-lock" title={`${lock.userName} さんが編集中`}>
                      <Lock size={12} />
                      {getShortName(lock.userName)}編集中
                    </span>
                  )}
                </span>
                <span className="sc-desc">{s.description || ' '}</span>
              </span>
              <span className="sc-c">{s.work_type ? <span className="sc-badge">{s.work_type}</span> : <span className="sc-muted">—</span>}</span>
              <StaffCell schedule={s} staff={staff} />
              <CoWorkers schedule={s} staff={staff} />
              <span className="sc-ellipsis">{s.area || <span className="sc-muted">—</span>}</span>
              <span className="sc-num sc-ellipsis">{s.request_number || <span className="sc-muted">—</span>}</span>
              <span className="sc-c">
                {canEdit ? (
                  <button
                    type="button"
                    className={`sc-result${isDone ? ' is-done' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleComplete(s);
                    }}
                    title={isDone ? '未対応に戻す' : '完了にする'}
                  >
                    {isDone && <CheckCircle2 size={12} />}
                    {isDone ? '完了' : '未対応'}
                  </button>
                ) : (
                  <span className={`sc-result is-static${isDone ? ' is-done' : ''}`}>
                    {isDone && <CheckCircle2 size={12} />}
                    {isDone ? '完了' : '未対応'}
                  </span>
                )}
              </span>
              <span className="sc-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="sc-icon-btn"
                    title={lock ? `${lock.userName} さんが編集中` : '予定を編集'}
                    onClick={e => {
                      e.stopPropagation();
                      openEdit();
                    }}
                  >
                    {lock ? <Lock size={16} /> : <Pencil size={16} />}
                  </button>
                )}
                <ChevronDown size={16} className="sc-chevron" />
              </span>
            </div>
            {isOpen && (
              <dl className="sc-detail">
                <div><dt>状態</dt><dd>{meta.label}</dd></div>
                <div><dt>区分</dt><dd>{s.division || '—'}</dd></div>
                <div><dt>タイプ</dt><dd>{s.type || '—'}</dd></div>
                <div><dt>BOX</dt><dd>{s.box || '—'}</dd></div>
                <div><dt>移動</dt><dd>{s.transport || '—'}</dd></div>
                <div><dt>コース</dt><dd className="sc-num">{s.course || '—'}</dd></div>
                <div><dt>開始</dt><dd className="sc-num">{s.started_at || '—'}</dd></div>
                <div><dt>完了</dt><dd className="sc-num">{s.completed_at || '—'}</dd></div>
                <div className="is-wide"><dt>作業内容</dt><dd>{s.description || '—'}</dd></div>
                <div className="is-wide"><dt>備考</dt><dd>{notes || '—'}</dd></div>
                {s.report_notes && <div className="is-wide"><dt>報告</dt><dd>{s.report_notes}</dd></div>}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- 月間予定表の日ごとの列に積む小さいカード ---------------- */

interface CompactScheduleCardProps {
  schedule: Schedule;
  staff: Staff[];
  selected: boolean;
  searchState: '' | 'match' | 'no-match';
  lock?: LockInfo;
  onClick: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const CompactScheduleCard: React.FC<CompactScheduleCardProps> = ({ schedule: s, staff, selected, searchState, lock, onClick, onEdit, onContextMenu }) => {
  const meta = statusMeta(s.status);
  const time = normalizeTargetTime(s.target_time);
  return (
    <div
      className={`scc-card tone-${meta.tone}${selected ? ' is-selected' : ''}${searchState ? ` is-${searchState}` : ''}`}
      onClick={onClick}
      onDoubleClick={() => (lock ? lockAlert(lock) : onEdit())}
      onContextMenu={onContextMenu}
      title="ダブルクリックで編集・右クリックでメニュー"
    >
      <div className="scc-top">
        <span className={`scc-time sc-num${time === '必ず' ? ' is-must' : ''}`}>{time || '—'}</span>
        <span className="scc-unit sc-num">{s.unit_number || ''}</span>
        <span className="scc-staff"><StaffCell schedule={s} staff={staff} /></span>
      </div>
      <div className="scc-property">
        {s.property_name}
        {lock && (
          <span className="sc-lock" title={`${lock.userName} さんが編集中`}>
            <Lock size={12} />
            {getShortName(lock.userName)}
          </span>
        )}
      </div>
      {(s.work_type || s.description) && (
        <div className="scc-bottom">
          {s.work_type && <span className="sc-badge">{s.work_type}</span>}
          <span className="scc-desc">{s.description}</span>
        </div>
      )}
    </div>
  );
};
