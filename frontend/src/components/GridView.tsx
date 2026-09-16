import React, { useState, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import type { Schedule, Staff, UserRole, WorkType } from '../types';
import { getShortName, cleanMetadata, splitCoWorkers, canManageSchedules, normalizeTargetTime, compareSchedules } from '../types';

import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, CheckCircle2, Download, Eye, EyeOff, Printer, Lock, ArrowUpDown, RotateCcw } from 'lucide-react';
import { PrintPreviewModal } from './PrintPreviewModal';
import { ScheduleSidePanel } from './ScheduleSidePanel';
import './GridView.css';

interface GridViewProps {
  schedules: Schedule[];
  staff: Staff[];
  workTypes?: WorkType[];
  onOpenAddModal: (date: string) => void;
  onOpenEditModal: (schedule: Schedule) => void;
  onSave: (scheduleData: Partial<Schedule>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  currentUserRole: UserRole;
  currentStaffId: number | null;
  currentUserName?: string;
  activeLocks?: Record<number, { userEmail: string; userName: string; startedAt: number }>;
  zoomLevel?: number;
}

export const GridView: React.FC<GridViewProps> = ({
  schedules,
  staff,
  workTypes = [],
  onOpenAddModal,
  onOpenEditModal,
  onSave,
  onDelete,
  currentUserRole,
  currentStaffId,
  currentUserName = '担当者',
  activeLocks = {},
  zoomLevel = 100,
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const triggerDatePicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === 'function') {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.click();
      }
    }
  };

  const exportToExcel = () => {
    const headers = [
      '区分', 'タイプ', 'BOX', '号機', '物件名', '種別', '作業内容', '時間', '対応者', 'エリア', '移動', '同行者', '依頼番号', '結果', '備考'
    ];

    const rows = sortedSchedules.map(s => {
      const staffMember = staff.find(st => st.id === s.staff_id);
      return [
        s.division || '',
        s.type || '',
        s.box || '',
        s.unit_number || '',
        s.property_name || '',
        s.work_type || '',
        s.description || '',
        s.target_time || '',
        getShortName(staffMember ? staffMember.name : s.staff_name || ''),
        s.area || '',
        s.transport || '',
        s.co_worker ? s.co_worker.split(/[,、]/).map(name => getShortName(name.trim())).filter(Boolean).join(', ') : '',
        s.request_number || '',
        s.result || '未対応',
        cleanMetadata(s.notes)
      ];
    });

    if (rows.length === 0) {
      alert('現在表示されている予定（データ）はありません。');
      return;
    }

    // ワークブックとワークシートの初期化
    const wb = XLSX.utils.book_new();
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 列幅の設定 (wch: 文字数単位)
    const colWidths = [
      { wch: 8 },  // 区分
      { wch: 8 },  // タイプ
      { wch: 8 },  // BOX
      { wch: 10 }, // 号機
      { wch: 30 }, // 物件名
      { wch: 10 }, // 種別
      { wch: 60 }, // 作業内容
      { wch: 12 }, // 時間
      { wch: 12 }, // 対応者
      { wch: 12 }, // エリア
      { wch: 8 },  // 移動
      { wch: 12 }, // 同行者
      { wch: 15 }, // 依頼番号
      { wch: 10 }, // 結果
      { wch: 30 }  // 備考
    ];
    ws['!cols'] = colWidths;

    // セルのスタイル設定（游ゴシック、上揃え、折り返し表示 wrapText）
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let r = range.s.r; r <= range.e.r; ++r) {
      for (let c = range.s.c; c <= range.e.c; ++c) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;
        
        // デフォルトスタイル
        ws[cellRef].s = {
          alignment: {
            vertical: 'top',
            wrapText: true
          },
          font: {
            name: '游ゴシック',
            size: 10
          }
        };

        // ヘッダー行 (r === 0) のスタイル (淡い緑色の背景)
        if (r === 0) {
          ws[cellRef].s = {
            fill: {
              fgColor: { rgb: 'E2EFDA' } // 淡い緑
            },
            font: {
              name: '游ゴシック',
              size: 10,
              bold: true
            },
            alignment: {
              vertical: 'center',
              horizontal: 'center',
              wrapText: true
            },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          };
        } else {
          // データ行の上下左右すべての格子状の罫線（はっきりした極細実線）
          ws[cellRef].s.border = {
            top: { style: 'thin', color: { rgb: '595959' } },
            bottom: { style: 'thin', color: { rgb: '595959' } },
            left: { style: 'thin', color: { rgb: '595959' } },
            right: { style: 'thin', color: { rgb: '595959' } }
          };
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, '予定表');
    
    const staffName = filterStaff !== 'all' 
      ? (staff.find(st => st.id === Number(filterStaff))?.name || '担当者')
      : '全体';
    XLSX.writeFile(wb, `${selectedDate}_${staffName}_予定表.xlsx`);
  };

  const [showFullText, setShowFullText] = useState(false);
  const [myScheduleOnly, setMyScheduleOnly] = useState(false);
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const daySchedules = schedules.filter(
    s => s.date === selectedDate && s.work_type !== '休暇'
  );
  
  const remainingCount = daySchedules.filter(
    s => s.result !== '完了' && s.status !== 'cancelled'
  ).length;

  // 指定日に「休み」または「公休」が登録されているスタッフ名を集計
  const holidayStaffNames = schedules
    .filter(s => s.date === selectedDate && s.work_type === '休暇')
    .map(s => {
      const st = staff.find(st => st.id === s.staff_id);
      return st ? getShortName(st.name) : getShortName(s.staff_name || '不明');
    })
    .filter(Boolean);

  const filteredSchedules = schedules.filter(s => {
    if (s.work_type === '休暇') {
      return false;
    }
    if (s.date !== selectedDate) {
      return false;
    }
    if (myScheduleOnly && currentStaffId !== null) {
      if (s.staff_id !== currentStaffId) {
        return false;
      }
    } else if (filterStaff !== 'all' && s.staff_id !== Number(filterStaff)) {
      return false;
    }
    if (filterStatus !== 'all' && s.status !== filterStatus) {
      return false;
    }
    // 同行でコース番号が振られていない人は別途の行追加は不要（除外）
    const isCoWorkerChild = s.notes && s.notes.includes('[__parent_id:');
    if (isCoWorkerChild) {
      const courseStr = String(s.course || '').trim();
      if (!courseStr) return false;
    }
    return true;
  });

  const cleansedSchedules = filteredSchedules.map(s => {
    if (s.status === 'cancelled') {
      return {
        ...s,
        division: '未定',
        staff_id: null,
        staff_name: '',
        course: ''
      };
    }
    return s;
  });

  const [selectedScheduleForPanel, setSelectedScheduleForPanel] = useState<Schedule | null>(null);
  const [sortColumn, setSortColumn] = useState<'default' | 'unit_number' | 'property_name' | 'target_time' | 'staff_name'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const sortedSchedules = [...cleansedSchedules].sort((a, b) => {
    if (sortColumn === 'default') {
      return compareSchedules(a, b);
    }
    let valA = '';
    let valB = '';
    if (sortColumn === 'unit_number') {
      valA = String(a.unit_number || '');
      valB = String(b.unit_number || '');
    } else if (sortColumn === 'property_name') {
      valA = String(a.property_name || '');
      valB = String(b.property_name || '');
    } else if (sortColumn === 'target_time') {
      valA = String(a.target_time || '');
      valB = String(b.target_time || '');
    } else if (sortColumn === 'staff_name') {
      valA = String(a.staff_name || '');
      valB = String(b.staff_name || '');
    }
    const cmp = valA.localeCompare(valB, 'ja', { numeric: true });
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const currentIndex = selectedScheduleForPanel 
    ? sortedSchedules.findIndex(s => s.id === selectedScheduleForPanel.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < sortedSchedules.length - 1;

  const handleSelectPrev = () => {
    if (hasPrev) {
      setSelectedScheduleForPanel(sortedSchedules[currentIndex - 1]);
    }
  };

  const handleSelectNext = () => {
    if (hasNext) {
      setSelectedScheduleForPanel(sortedSchedules[currentIndex + 1]);
    }
  };

  const handleSortToggle = (column: 'unit_number' | 'property_name' | 'target_time' | 'staff_name') => {
    if (sortColumn === column) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortColumn('default');
        setSortOrder('asc');
      }
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };


  const handleQuickCompleteToggle = async (schedule: Schedule) => {
    const newResult = schedule.result === '完了' ? '' : '完了';
    try {
      await onSave({
        id: schedule.id,
        result: newResult,
      });
    } catch (error) {
      console.error('Failed to quick update status:', error);
    }
  };

  const formatJapaneseDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月${d.getDate()}日 (${weekDays[d.getDay()]})`;
  };

  const isAdmin = canManageSchedules(currentUserRole);

  return (
    <div className="grid-view-container card">
      <div className="grid-view-header">
        {/* 1段目: 情報・日付コンテキスト行 */}
        <div className="grid-header-top-row">
          <div className="grid-date-selector">
            <div className="date-nav-controls">
              <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(-1)} title="前日へ">
                <ChevronLeft size={16} />
              </button>
              <div className="date-picker-wrapper" onClick={triggerDatePicker} title="クリックして日付を選択" style={{ cursor: 'pointer' }}>
                <input
                  ref={dateInputRef}
                  type="date"
                  className="date-picker-input"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                />
                <span className="current-date-display">
                  <CalendarIcon size={16} style={{ marginRight: '6px' }} />
                  {formatJapaneseDate(selectedDate)}
                </span>
              </div>
              <button className="btn btn-secondary btn-sm-nav" onClick={setToday}>
                今日
              </button>
              <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(1)} title="翌日へ">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid-header-top-right">
            <div className="remaining-counter-badge">
              <span className="counter-title">本日の残件数</span>
              <span className="counter-number">{remainingCount}</span>
              <span className="counter-total">/ {daySchedules.length}件中</span>
            </div>
          </div>
        </div>

        {/* 2段目: フィルター＆アクション行 */}
        <div className="grid-header-bottom-row">
          <div className="grid-filters-left">
            <div className="filter-item">
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select 
                className="form-control filter-select"
                value={filterStaff}
                onChange={(e) => {
                  setFilterStaff(e.target.value);
                  setMyScheduleOnly(false);
                }}
              >
                <option value="all">すべての担当者</option>
                {staff
                  .filter(st => st.is_active !== 0 || String(st.id) === filterStaff)
                  .map(st => (
                    <option key={st.id} value={st.id}>{getShortName(st.name)}</option>
                  ))}
              </select>
            </div>

            <div className="filter-item">
              <select 
                className="form-control filter-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">すべての状況</option>
                <option value="confirmed">確定予定</option>
                <option value="draft">仮予定</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>

            {currentStaffId !== null && (
              <button 
                className={`btn btn-my-schedule ${myScheduleOnly ? 'active' : ''}`} 
                onClick={() => {
                  setMyScheduleOnly(!myScheduleOnly);
                  if (!myScheduleOnly) {
                    setFilterStaff('all');
                  }
                }}
                title="ログインしているあなたの予定のみに一括で絞り込みます"
              >
                自分の予定のみ表示
              </button>
            )}
          </div>

          <div className="grid-actions-right">
            {sortColumn !== 'default' && (
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setSortColumn('default');
                  setSortOrder('asc');
                }}
                title="コース最優先・設置➔委託の業務標準ソートに戻します"
                style={{ color: 'var(--primary, #4f46e5)', borderColor: 'var(--primary, #4f46e5)', fontWeight: '600' }}
              >
                <RotateCcw size={14} style={{ marginRight: '4px' }} />
                <span>標準ソートに戻す</span>
              </button>
            )}

            <button 
              className={`btn btn-toggle-view ${showFullText ? 'active' : ''}`} 
              onClick={() => setShowFullText(!showFullText)}
              title={showFullText ? "2〜3行の標準折り返し表示に戻します" : "すべての予定の物件名・作業内容・備考のテキストを折り返して全行展開します"}
            >
              {showFullText ? <EyeOff size={15} /> : <Eye size={15} />}
              <span>{showFullText ? '標準表示に戻す' : '全文表示に切替'}</span>
            </button>

            <button 
              className="btn btn-action-excel" 
              onClick={exportToExcel}
              title="Excelファイル (.xlsx) としてダウンロードします"
            >
              <Download size={15} />
              <span>Excelで開く</span>
            </button>

            <button 
              className="btn btn-action-print" 
              onClick={() => setIsPrintPreviewOpen(true)}
              title="印刷用のプレビュー画面を開きます"
            >
              <Printer size={15} />
              <span>印刷プレビュー</span>
            </button>
          </div>
        </div>
      </div>

      {holidayStaffNames.length > 0 && (
        <div className="holiday-summary-bar" style={{ margin: '0 1.5rem 1rem' }}>
          <span className="holiday-label">本日の公休：</span>
          {holidayStaffNames.map(name => (
            <span key={name} className="holiday-badge">{name}</span>
          ))}
        </div>
      )}

      <div className="grid-table-wrapper">
        <div
          className="grid-table-zoom-inner"
          style={zoomLevel !== 100 ? {
            zoom: `${zoomLevel}%`,
            minHeight: `calc(100% / ${zoomLevel / 100})`,
            width: 'max-content',
            minWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
          } : {
            width: '100%',
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        <table className={`spreadsheet-table ${showFullText ? 'show-full-text' : ''}`}>
          <thead>
            <tr>
              <th style={{ width: '42px', textAlign: 'center' }}>区分</th>
              <th style={{ width: '40px' }}>タイプ</th>
              <th style={{ width: '42px' }}>BOX</th>
              <th 
                style={{ width: '65px', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSortToggle('unit_number')}
                title="クリックで号機順に並び替え"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>号機</span>
                  <ArrowUpDown size={11} style={{ opacity: sortColumn === 'unit_number' ? 1 : 0.35, color: sortColumn === 'unit_number' ? 'var(--primary, #4f46e5)' : 'inherit' }} />
                </div>
              </th>
              <th 
                style={{ width: '240px', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSortToggle('property_name')}
                title="クリックで物件名順に並び替え"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>物件名</span>
                  <ArrowUpDown size={11} style={{ opacity: sortColumn === 'property_name' ? 1 : 0.35, color: sortColumn === 'property_name' ? 'var(--primary, #4f46e5)' : 'inherit' }} />
                </div>
              </th>
              <th style={{ width: '58px' }}>種別</th>
              <th style={{ width: '340px' }}>作業内容</th>
              <th 
                style={{ width: '68px', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSortToggle('target_time')}
                title="クリックで時間順に並び替え"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>時間</span>
                  <ArrowUpDown size={11} style={{ opacity: sortColumn === 'target_time' ? 1 : 0.35, color: sortColumn === 'target_time' ? 'var(--primary, #4f46e5)' : 'inherit' }} />
                </div>
              </th>
              <th 
                style={{ width: '85px', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSortToggle('staff_name')}
                title="クリックで対応者順に並び替え"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>対応者</span>
                  <ArrowUpDown size={11} style={{ opacity: sortColumn === 'staff_name' ? 1 : 0.35, color: sortColumn === 'staff_name' ? 'var(--primary, #4f46e5)' : 'inherit' }} />
                </div>
              </th>
              <th style={{ width: '75px' }}>エリア</th>
              <th style={{ width: '48px' }}>移動</th>
              <th style={{ width: '85px' }}>同行者</th>
              <th style={{ width: '85px' }}>依頼番号</th>
              <th style={{ width: '72px', textAlign: 'center' }}>結果</th>
              <th style={{ width: '130px' }}>備考</th>
            </tr>
          </thead>
          <tbody>
            {sortedSchedules.length === 0 ? (
              <tr>
                <td colSpan={15} className="no-data-cell">
                  登録された予定はありません
                </td>
              </tr>
            ) : (
              sortedSchedules.map((schedule) => {
                const staffMember = staff.find(st => st.id === schedule.staff_id);
                const isCompleted = schedule.result === '完了';

                const isAdmin = canManageSchedules(currentUserRole);

                const isSelected = selectedScheduleForPanel?.id === schedule.id;

                return (
                  <tr 
                    key={schedule.id} 
                    onClick={() => setSelectedScheduleForPanel(schedule)}
                    onDoubleClick={isAdmin ? () => onOpenEditModal(schedule) : undefined}
                    className={`spreadsheet-row ${isCompleted ? 'row-completed' : ''} ${isSelected ? 'row-selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ textAlign: 'center', fontWeight: '500' }}>
                      {schedule.division}
                    </td>
                    <td>{schedule.type}</td>
                    <td>{schedule.box}</td>
                    <td>{schedule.unit_number}</td>
                    <td className="bold-cell" title={schedule.property_name}>
                      <div className="cell-clamp-2">
                        {schedule.property_name}
                        {typeof schedule.id === 'number' && activeLocks[schedule.id] && (
                          <span className="editing-lock-badge" title={`${activeLocks[schedule.id].userName} さんが編集中`} style={{ marginLeft: '6px' }}>
                            <Lock size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                            {getShortName(activeLocks[schedule.id].userName)}編集中
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{schedule.work_type}</td>
                    <td className="description-cell" title={schedule.description || ''}>
                      <div className="cell-clamp-3">
                        {schedule.description}
                      </div>
                    </td>
                    <td className="time-cell">
                      {normalizeTargetTime(schedule.target_time)}
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      {staffMember ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                          {staffMember.avatar_url ? (
                            <img 
                              src={staffMember.avatar_url} 
                              alt={staffMember.name} 
                              style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                            />
                          ) : (
                            <div style={{ 
                              width: '22px', 
                              height: '22px', 
                              borderRadius: '50%', 
                              backgroundColor: 'var(--primary, #4f46e5)', 
                              color: 'white', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontSize: '0.65rem', 
                              fontWeight: 'bold',
                              flexShrink: 0
                            }}>
                              {getShortName(staffMember.name).substring(0, 1)}
                            </div>
                          )}
                          <span className="staff-indicator-tag" style={{ borderLeft: '3px solid var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getShortName(staffMember.name)}
                          </span>
                        </div>
                      ) : (
                        schedule.staff_name ? (
                          <span className="staff-indicator-tag" style={{ borderLeft: '3px solid #6b7280' }}>
                            {getShortName(schedule.staff_name)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>未設定</span>
                        )
                      )}
                    </td>
                    <td>{schedule.area}</td>
                    <td>{schedule.transport}</td>
                    <td>
                      {(() => {
                        const coWorkersStr = schedule.co_worker || '';
                        const coWorkersList = splitCoWorkers(coWorkersStr, staff);
                        return (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {coWorkersList.map((name, idx) => (
                              <span key={idx} className="staff-indicator-tag" style={{ borderLeft: '3px solid var(--primary)' }}>
                                {getShortName(name)}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td>{schedule.request_number}</td>
                    
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {isAdmin ? (
                        isCompleted ? (
                          <button
                            className="btn-result-completed"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickCompleteToggle(schedule);
                            }}
                            title="未完了に戻す"
                            style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0.2rem 0.5rem', height: 'auto', minHeight: 'unset' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={12} />
                              完了
                            </div>
                            {schedule.completed_at && (
                              <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{schedule.completed_at}</span>
                            )}
                          </button>
                        ) : (
                          <button
                            className="btn-result-incomplete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickCompleteToggle(schedule);
                            }}
                            title="完了にする"
                          >
                            未対応
                          </button>
                        )
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span className={`status-badge-cell ${isCompleted ? 'status-confirmed' : 'status-draft'}`} style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                            {isCompleted ? '完了' : '未対応'}
                          </span>
                          {isCompleted && schedule.completed_at && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{schedule.completed_at}</span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="notes-cell" title={cleanMetadata(schedule.notes)}>
                      <div className="cell-clamp-2">
                        {cleanMetadata(schedule.notes)}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="grid-view-footer">
        {isAdmin ? (
          <button 
            className="btn btn-primary btn-add-schedule"
            onClick={() => onOpenAddModal(selectedDate)}
            title="新規予定を追加"
          >
            <Plus size={16} />
            予定を追加
          </button>
        ) : (
          <div></div>
        )}
        <span className="grid-row-count">
          表示件数: {filteredSchedules.length} 件
        </span>
      </div>

      <PrintPreviewModal
        isOpen={isPrintPreviewOpen}
        onClose={() => setIsPrintPreviewOpen(false)}
        schedules={daySchedules}
        staff={staff}
        selectedDate={selectedDate}
        initialFilterStaff={myScheduleOnly && currentStaffId !== null ? String(currentStaffId) : filterStaff}
      />

      <ScheduleSidePanel
        schedule={selectedScheduleForPanel}
        isOpen={selectedScheduleForPanel !== null}
        onClose={() => setSelectedScheduleForPanel(null)}
        onSave={async (data) => {
          await onSave(data);
          if (selectedScheduleForPanel) {
            setSelectedScheduleForPanel(prev => prev ? { ...prev, ...data } : null);
          }
        }}
        onDelete={onDelete}
        staff={staff}
        schedules={schedules}
        workTypes={workTypes}
        currentUserRole={currentUserRole}
        currentUserName={currentUserName}
        onSelectPrev={handleSelectPrev}
        onSelectNext={handleSelectNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
    </div>
  );
};
