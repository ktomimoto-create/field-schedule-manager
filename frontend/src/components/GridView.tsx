import React, { useState, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import type { Schedule, Staff } from '../types';
import { getShortName } from '../types';

import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, CheckCircle2, Download, Eye, EyeOff, Printer } from 'lucide-react';
import { PrintPreviewModal } from './PrintPreviewModal';
import './GridView.css';

interface GridViewProps {
  schedules: Schedule[];
  staff: Staff[];
  onOpenAddModal: (date: string) => void;
  onOpenEditModal: (schedule: Schedule) => void;
  onSave: (scheduleData: Partial<Schedule>) => Promise<void>;
  currentUserRole: 'admin' | 'user';
  currentStaffId: number | null;
}

export const GridView: React.FC<GridViewProps> = ({
  schedules,
  staff,
  onOpenAddModal,
  onOpenEditModal,
  onSave,
  currentUserRole,
  currentStaffId,
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
        staffMember ? staffMember.name : s.staff_name || '',
        s.area || '',
        s.transport || '',
        s.co_worker || '',
        s.request_number || '',
        s.result || '未対応',
        s.notes || ''
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

  const sortedSchedules = [...cleansedSchedules].sort((a, b) => {
    // キャンセルされた予定は常に最下部に配置
    const aCancelled = a.status === 'cancelled';
    const bCancelled = b.status === 'cancelled';
    if (aCancelled !== bCancelled) {
      return aCancelled ? 1 : -1;
    }

    // 1. コース番号（course）の昇順
    const aCourse = Number(a.course) || 999;
    const bCourse = Number(b.course) || 999;
    if (aCourse !== bCourse) {
      return aCourse - bCourse;
    }

    // 2. エリア（area）の昇順
    const aArea = a.area || '';
    const bArea = b.area || '';
    if (aArea !== bArea) {
      return aArea.localeCompare(bArea, 'ja');
    }

    // 3. 号機（unit_number）の若い順（数値比較、ダメなら文字列比較）
    const aUnit = Number(a.unit_number);
    const bUnit = Number(b.unit_number);
    const hasAUnit = a.unit_number && !isNaN(aUnit);
    const hasBUnit = b.unit_number && !isNaN(bUnit);

    if (hasAUnit && hasBUnit) {
      return aUnit - bUnit;
    }
    const aUnitStr = a.unit_number || '';
    const bUnitStr = b.unit_number || '';
    return aUnitStr.localeCompare(bUnitStr, 'ja');
  });


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

  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="grid-view-container card">
      <div className="grid-view-header">
        <div className="grid-date-selector">
          <div className="date-nav-controls">
            <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(-1)}>
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
            <button className="btn btn-secondary btn-sm-nav" onClick={() => changeDate(1)}>
              <ChevronRight size={16} />
            </button>
            {isAdmin && (
              <button 
                className="btn btn-primary btn-sm-nav" 
                onClick={() => onOpenAddModal(selectedDate)}
                title="新規予定を追加"
                style={{ marginLeft: '0.25rem' }}
              >
                <Plus size={14} style={{ marginRight: '4px' }} />
                予定を追加
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <span className="grid-double-click-guide">
            ※ 行をダブルクリックで編集できます
          </span>
        )}

        <div className="remaining-counter-badge">
          <span className="counter-title">本日の残件数</span>
          <span className="counter-number">{remainingCount}</span>
          <span className="counter-total">/ {daySchedules.length}件中</span>
        </div>

        <div className="grid-filters">
          <div className="filter-item">
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select 
              className="form-control filter-select"
              value={filterStaff}
              onChange={(e) => {
                setFilterStaff(e.target.value);
                setMyScheduleOnly(false); // 手動で担当者を選択した場合は「自分の予定のみ」を解除
              }}
            >
              <option value="all">すべての担当者</option>
              {staff.map(st => (
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
              className={`btn ${myScheduleOnly ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => {
                setMyScheduleOnly(!myScheduleOnly);
                if (!myScheduleOnly) {
                  setFilterStaff('all'); // 自分の予定のみにする時は、個別担当者フィルターをリセット
                }
              }}
              title="ログインしているあなたの予定のみに一括で絞り込みます"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            >
              自分の予定のみ表示
            </button>
          )}

          <button 
            className="btn btn-primary" 
            onClick={() => setIsPrintPreviewOpen(true)}
            title="自分の予定だけを絞り込んで、一時的なメモを書き足し、A4用紙等に綺麗に印刷できるプレビュー画面を開きます"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, backgroundColor: 'var(--primary)', border: 'none' }}
          >
            <Printer size={14} />
            印刷プレビュー
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={exportToExcel}
            title="現在表示されている予定の一覧を、列幅や折り返し設定が適用されたExcelファイル (.xlsx) としてダウンロードして開きます"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <Download size={14} />
            Excelで開く
          </button>

          <button 
            className={`btn ${showFullText ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => setShowFullText(!showFullText)}
            title="すべての予定の物件名・作業内容・備考の改行や長いテキストを折り返して全表示します"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            {showFullText ? <EyeOff size={14} /> : <Eye size={14} />}
            {showFullText ? '簡易表示に戻す' : '全文表示に切替'}
          </button>
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
        <table className={`spreadsheet-table ${showFullText ? 'show-full-text' : ''}`}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>区分</th>
              <th style={{ width: '50px' }}>タイプ</th>
              <th style={{ width: '60px' }}>BOX</th>
              <th style={{ width: '65px' }}>号機</th>
              <th style={{ width: '180px' }}>物件名</th>
              <th style={{ width: '65px' }}>種別</th>
              <th style={{ width: '250px' }}>作業内容</th>
              <th style={{ width: '70px' }}>時間</th>
              <th style={{ width: '75px' }}>対応者</th>
              <th style={{ width: '75px' }}>エリア</th>
              <th style={{ width: '50px' }}>移動</th>
              <th style={{ width: '75px' }}>同行者</th>
              <th style={{ width: '85px' }}>依頼番号</th>
              <th style={{ width: '75px', textAlign: 'center' }}>結果</th>
              <th style={{ width: '120px' }}>備考</th>
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

                const isAdmin = currentUserRole === 'admin';

                return (
                  <tr 
                    key={schedule.id} 
                    onDoubleClick={isAdmin ? () => onOpenEditModal(schedule) : undefined}
                    className={`spreadsheet-row ${isCompleted ? 'row-completed' : ''}`}
                  >
                    <td style={{ textAlign: 'center', fontWeight: '500' }}>
                      {schedule.division}
                    </td>
                    <td>{schedule.type}</td>
                    <td>{schedule.box}</td>
                    <td>{schedule.unit_number}</td>
                    <td className="bold-cell" title={schedule.property_name}>
                      {schedule.property_name}
                    </td>
                    <td>{schedule.work_type}</td>
                    <td className="description-cell" title={schedule.description || ''}>
                      {schedule.description}
                    </td>
                    <td className="time-cell" style={{ 
                      backgroundColor: schedule.target_time === '必ず' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                      color: schedule.target_time === '必ず' ? 'var(--danger)' : 'inherit',
                      fontWeight: schedule.target_time === '必ず' ? '700' : 'normal'
                    }}>
                      {schedule.target_time}
                    </td>
                    <td>
                      {staffMember && (
                        <span className="staff-indicator-tag" style={{ borderLeft: '3px solid var(--primary)' }}>
                          {getShortName(staffMember.name)}
                        </span>
                      )}

                    </td>
                    <td>{schedule.area}</td>
                    <td>{schedule.transport}</td>
                    <td>
                      {(() => {
                        const coWorkersStr = schedule.co_worker || '';
                        const coWorkersList = coWorkersStr ? coWorkersStr.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean) : [];
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
                            onClick={() => handleQuickCompleteToggle(schedule)}
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
                            onClick={() => handleQuickCompleteToggle(schedule)}
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

                    <td className="notes-cell" title={schedule.notes || ''}>
                      {schedule.notes}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="grid-view-footer">
        {currentUserRole === 'admin' ? (
          <button 
            className="btn btn-primary"
            onClick={() => onOpenAddModal(selectedDate)}
          >
            <Plus size={16} />
            新しい行（予定）を追加
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
    </div>
  );
};
