import React, { useState } from 'react';
import type { Schedule, Staff } from '../types';
import { getShortName } from '../types';

import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight, GripVertical, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { ReportModal } from './ReportModal';
import './TimelineView.css';

interface TimelineViewProps {
  schedules: Schedule[];
  staff: Staff[];
  onOpenEditModal: (schedule: Schedule) => void;
  currentUserRole: 'admin' | 'user';
  currentStaffId: number | null;
  onUpdateResult: (
    scheduleId: number | string, 
    resultValue: string,
    startedAt?: string | null,
    completedAt?: string | null,
    reportNotes?: string | null
  ) => Promise<void>;
  onReorder: (orders: { id: number | string; sort_order: number }[]) => Promise<void>;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  schedules,
  staff,
  onOpenEditModal,
  currentUserRole,
  currentStaffId,
  onUpdateResult,
  onReorder,
}) => {
  const [targetDateStr, setTargetDateStr] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [showOnlyMySchedule, setShowOnlyMySchedule] = useState(() => {
    return currentUserRole === 'user';
  });
  const [draggedItem, setDraggedItem] = useState<Schedule | null>(null);
  const [reportSchedule, setReportSchedule] = useState<Schedule | null>(null);

  const changeDate = (days: number) => {
    const d = new Date(targetDateStr);
    d.setDate(d.getDate() + days);
    setTargetDateStr(d.toISOString().split('T')[0]);
  };

  const setToday = () => {
    setTargetDateStr(new Date().toISOString().split('T')[0]);
  };

  // 当日の対象全予定（通常・確定・仮）
  const todaySchedules = schedules.filter(
    s => s.date === targetDateStr && (s.status === 'confirmed' || s.status === 'draft' || s.status === 'free')
  );

  // 指定日に「休み」または「公休」が登録されているスタッフIDを特定
  const holidayStaffIds = new Set(
    todaySchedules
      .filter(s => s.work_type === '休暇')
      .map(s => s.staff_id)
      .filter((id): id is number => id !== null)
  );

  // 休みメンバーの名前一覧
  const holidayStaffNames = staff
    .filter(member => holidayStaffIds.has(member.id))
    .map(member => getShortName(member.name));

  // スタッフの絞り込みとコース順ソート
  const filteredStaff = staff
    .filter(member => {
      if (holidayStaffIds.has(member.id)) {
        return false;
      }
      if (showOnlyMySchedule && currentStaffId !== null) {
        return member.id === currentStaffId;
      }
      // 無効なスタッフ (is_active === 0) は、当日に予定が存在しない場合のみ除外
      if (member.is_active === 0) {
        const hasSchedule = todaySchedules.some(s => s.staff_id === member.id);
        if (!hasSchedule) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aCourse = a.default_course ? parseInt(a.default_course, 10) : NaN;
      const bCourse = b.default_course ? parseInt(b.default_course, 10) : NaN;
      
      const aIsNan = isNaN(aCourse);
      const bIsNan = isNaN(bCourse);
      
      if (aIsNan && bIsNan) {
        const aVal = a.default_course || '';
        const bVal = b.default_course || '';
        return aVal.localeCompare(bVal);
      }
      if (aIsNan) return 1;
      if (bIsNan) return -1;
      
      return aCourse - bCourse;
    });

  const formatJapaneseDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月${d.getDate()}日 (${weekDays[d.getDay()]})`;
  };

  // ドラッグ＆ドロップイベント
  const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
    setDraggedItem(schedule);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', schedule.id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetSchedule: Schedule, currentList: Schedule[]) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetSchedule.id) return;

    if (draggedItem.staff_id !== targetSchedule.staff_id) {
      alert("他のスタッフの予定リストへ直接並び替えることはできません。");
      return;
    }

    const newList = [...currentList];
    const draggedIdx = newList.findIndex(item => item.id === draggedItem.id);
    const targetIdx = newList.findIndex(item => item.id === targetSchedule.id);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      // 位置の入れ替え
      const [removed] = newList.splice(draggedIdx, 1);
      newList.splice(targetIdx, 0, removed);

      // sort_order の再定義
      const updatedOrders = newList.map((item, index) => ({
        id: item.id,
        sort_order: index,
      }));

      // API を経由して順序を永続化
      await onReorder(updatedOrders);
    }
    setDraggedItem(null);
  };

  const handleMoveCard = async (schedule: Schedule, direction: 'up' | 'down', currentList: Schedule[]) => {
    const idx = currentList.findIndex(item => item.id === schedule.id);
    if (idx === -1) return;

    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === currentList.length - 1) return;

    const newList = [...currentList];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;

    // 入れ替え
    const temp = newList[idx];
    newList[idx] = newList[targetIdx];
    newList[targetIdx] = temp;

    // sort_order の再定義
    const updatedOrders = newList.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }));

    await onReorder(updatedOrders);
  };

  return (
    <div className="timeline-container card">
      <div className="timeline-header">
        <div className="timeline-date-nav">
          <Calendar className="icon-purple" size={20} />
          <h2>{formatJapaneseDate(targetDateStr)} の行動予定表</h2>
          <div className="timeline-nav-buttons">
            <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button className="btn btn-secondary btn-sm-nav" onClick={setToday}>
              今日
            </button>
            <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          {currentStaffId !== null && (
            <label className="my-filter-checkbox">
              <input 
                type="checkbox" 
                checked={showOnlyMySchedule} 
                onChange={(e) => setShowOnlyMySchedule(e.target.checked)} 
              />
              自分の予定のみ表示
            </label>
          )}
        </div>

        <div className="timeline-stats">
          <div className="stat-badge">
            <span className="stat-label">本日予定数</span>
            <span className="stat-val confirmed-val">
              {todaySchedules.filter(s => {
                if (showOnlyMySchedule && currentStaffId !== null) {
                  return s.staff_id === currentStaffId;
                }
                return true;
              }).length}件
            </span>
          </div>
        </div>
      </div>

      {holidayStaffNames.length > 0 && (
        <div className="holiday-summary-bar">
          <span className="holiday-label">本日の公休：</span>
          {holidayStaffNames.map(name => (
            <span key={name} className="holiday-badge">{name}</span>
          ))}
        </div>
      )}

      <div className="card-board-wrapper">
        {filteredStaff.map(member => {
          // 当日のこのスタッフ宛ての予定（sort_order昇順でソート）
          const memberSchedules = todaySchedules
            .filter(s => s.staff_id === member.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

          return (
            <div key={member.id} className="staff-board-column">
              <div className="board-column-header">
                {member.avatar_url ? (
                  <img 
                    src={member.avatar_url} 
                    alt={member.name} 
                    className="staff-avatar" 
                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} 
                  />
                ) : (
                  <div className="staff-avatar" style={{ backgroundColor: 'var(--primary)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.85rem', fontWeight: 'bold' }}>
                    {getShortName(member.name).charAt(0)}
                  </div>
                )}
                <span className="board-staff-name">{getShortName(member.name)}</span>
                <span className="board-schedule-count">{memberSchedules.length}件の対応</span>
              </div>

              <div className="board-cards-list">
                {memberSchedules.length === 0 ? (
                  <div className="empty-board-slot">予定はありません</div>
                ) : (
                  memberSchedules.map((schedule, idx) => {
                    const isCompleted = schedule.result === '完了';
                    const isMySchedule = schedule.staff_id === currentStaffId;
                    const canEdit = currentUserRole === 'admin' || isMySchedule;

                    return (
                      <div
                        key={schedule.id}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, schedule)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, schedule, memberSchedules)}
                        className={`schedule-item-card ${isCompleted ? 'completed' : ''} ${schedule.status === 'draft' ? 'draft-card' : ''} ${draggedItem?.id === schedule.id ? 'dragging' : ''}`}
                      >
                        {/* 左部：移動・順序 */}
                        <div className="card-drag-handle">
                          {canEdit && <GripVertical size={14} className="drag-icon" />}
                          <span className="card-order-number">{idx + 1}</span>
                          {canEdit && (
                            <div className="card-sort-buttons">
                              <button 
                                className="btn-sort-action"
                                disabled={idx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveCard(schedule, 'up', memberSchedules);
                                }}
                                title="1つ上へ"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button 
                                className="btn-sort-action"
                                disabled={idx === memberSchedules.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveCard(schedule, 'down', memberSchedules);
                                }}
                                title="1つ下へ"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 中央部：詳細情報 */}
                        <div 
                          className="card-main-info" 
                          onClick={() => {
                            if (currentUserRole === 'admin') {
                              onOpenEditModal(schedule);
                            } else if (isMySchedule) {
                              setReportSchedule(schedule);
                            }
                          }}
                        >
                          <div className="card-title-row">
                            <span className="card-property-name">{schedule.property_name}</span>
                            <span className={`card-work-type-badge ${
                              schedule.work_type === '障害' ? 'bg-danger' : 
                              schedule.work_type === '工事' ? 'bg-warning' : 'bg-info'
                            }`}>
                              {schedule.work_type || '一般'}
                            </span>
                          </div>

                          <div className="card-meta-row">
                            <span className="card-meta-item">
                              <Clock size={12} /> {schedule.target_time || '指定なし'}
                            </span>
                            {schedule.area && (
                              <span className="card-meta-item">
                                <MapPin size={12} /> {schedule.area}
                              </span>
                            )}
                            {isCompleted && schedule.completed_at && (
                              <span className="card-completed-time-badge">
                                <Check size={10} style={{ marginRight: '2px' }} />
                                {schedule.completed_at} 完了
                              </span>
                            )}
                          </div>

                          <div className="card-desc-box">
                            <p className="card-desc-text">{schedule.description || '※作業内容の記載なし'}</p>
                          </div>

                          {(schedule.co_worker || schedule.notes) && (
                            <div className="card-extra-row">
                              {schedule.co_worker && <span className="card-co-worker">同行: {schedule.co_worker}</span>}
                              {schedule.notes && <span className="card-notes" title={schedule.notes}>備考: {schedule.notes}</span>}
                            </div>
                          )}
                        </div>

                        {/* 右部：完了切り替え */}
                        <div className="card-action-side">
                          {canEdit ? (
                            <select 
                              className="select-result"
                              value={schedule.result || ''} 
                              onChange={(e) => onUpdateResult(schedule.id, e.target.value)}
                            >
                              <option value="">- 未定 -</option>
                              <option value="作業中">作業中</option>
                              <option value="完了">完了</option>
                              <option value="キャンセル">キャンセル</option>
                            </select>
                          ) : (
                            <span className={`status-badge-text ${
                              schedule.result === '完了' ? 'text-success' : 
                              schedule.result === '作業中' ? 'text-warning' : 'text-secondary'
                            }`}>
                              {schedule.result || '未定'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {reportSchedule && (
        <ReportModal
          isOpen={!!reportSchedule}
          onClose={() => setReportSchedule(null)}
          schedule={reportSchedule}
          onSave={async (scheduleId, result, startedAt, completedAt, reportNotes) => {
            await onUpdateResult(scheduleId, result, startedAt, completedAt, reportNotes);
            setReportSchedule(null);
          }}
        />
      )}
    </div>
  );
};
