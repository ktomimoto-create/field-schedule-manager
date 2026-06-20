import React, { useState } from 'react';
import type { Schedule, Staff } from '../types';
import { getShortName } from '../types';
import { Printer, X } from 'lucide-react';
import './PrintPreviewModal.css';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: Schedule[]; // 該当日の全予定（休暇を除く）
  staff: Staff[];
  selectedDate: string;
  initialFilterStaff: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  schedules,
  staff,
  selectedDate,
  initialFilterStaff,
}) => {
  const [filterStaff, setFilterStaff] = useState<string>(initialFilterStaff);
  const [memos, setMemos] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  // 1. スタッフでフィルタリング（GridViewと同様のロジック）
  const filteredSchedules = schedules.filter(s => {
    if (filterStaff !== 'all' && s.staff_id !== Number(filterStaff)) {
      return false;
    }
    return true;
  });

  // 2. キャンセル予定の強制クレンジング（GridViewと同様）
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

  // 3. ソート（GridViewと同様）
  const sortedSchedules = [...cleansedSchedules].sort((a, b) => {
    const aCancelled = a.status === 'cancelled';
    const bCancelled = b.status === 'cancelled';
    if (aCancelled !== bCancelled) {
      return aCancelled ? 1 : -1;
    }

    const aCourse = Number(a.course) || 999;
    const bCourse = Number(b.course) || 999;
    if (aCourse !== bCourse) {
      return aCourse - bCourse;
    }

    const aArea = a.area || '';
    const bArea = b.area || '';
    if (aArea !== bArea) {
      return aArea.localeCompare(bArea, 'ja');
    }

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

  const handlePrint = () => {
    window.print();
  };

  const formatJapaneseDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月${d.getDate()}日 (${weekDays[d.getDay()]})`;
  };

  return (
    <div className="print-preview-overlay">
      <div className="print-preview-modal card">
        <div className="print-preview-header no-print">
          <div className="header-left">
            <h2 className="print-title">印刷プレビュー</h2>
            <div className="filter-staff-selector">
              <span className="selector-label">印刷対象：</span>
              <select
                className="form-control filter-select"
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
              >
                <option value="all">全員分</option>
                {staff.map(st => (
                  <option key={st.id} value={st.id}>{getShortName(st.name)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="header-right">
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} style={{ marginRight: '6px' }} />
              印刷する
            </button>
            <button className="btn btn-secondary" onClick={onClose} title="閉じる">
              <X size={16} style={{ marginRight: '6px' }} />
              閉じる
            </button>
          </div>
        </div>

        <div className="print-area">
          <div className="print-document-header">
            <h1 className="document-title">
              行動予定表 ({formatJapaneseDate(selectedDate)})
            </h1>
            <div className="print-info-meta">
              <span>出力日: {new Date().toLocaleDateString('ja-JP')}</span>
              <span>対象: {filterStaff === 'all' ? '全員' : (staff.find(st => st.id === Number(filterStaff))?.name || '担当者')}</span>
            </div>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>区分</th>
                <th style={{ width: '40px' }}>タイプ</th>
                <th style={{ width: '50px' }}>BOX</th>
                <th style={{ width: '60px' }}>号機</th>
                <th style={{ width: '150px' }}>物件名</th>
                <th style={{ width: '55px' }}>種別</th>
                <th style={{ width: '220px' }}>作業内容</th>
                <th style={{ width: '60px' }}>時間</th>
                <th style={{ width: '70px' }}>対応者</th>
                <th style={{ width: '70px' }}>エリア</th>
                <th style={{ width: '45px' }}>移動</th>
                <th style={{ width: '70px' }}>同行者</th>
                <th style={{ width: '75px' }}>依頼番号</th>
                <th style={{ width: '150px' }}>印刷用備考（使い捨て）</th>
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.length === 0 ? (
                <tr>
                  <td colSpan={14} className="no-data-cell">
                    印刷対象の予定はありません
                  </td>
                </tr>
              ) : (
                sortedSchedules.map((schedule) => {
                  const staffMember = staff.find(st => st.id === schedule.staff_id);
                  return (
                    <tr key={schedule.id}>
                      <td style={{ textAlign: 'center' }}>{schedule.division || ''}</td>
                      <td>{schedule.type || ''}</td>
                      <td>{schedule.box || ''}</td>
                      <td>{schedule.unit_number || ''}</td>
                      <td className="bold-cell">{schedule.property_name || ''}</td>
                      <td>{schedule.work_type || ''}</td>
                      <td className="pre-wrap-cell">{schedule.description || ''}</td>
                      <td style={{ 
                        fontWeight: schedule.target_time === '必ず' ? '700' : 'normal',
                        textAlign: 'center'
                      }}>{schedule.target_time || ''}</td>
                      <td>
                        {staffMember ? getShortName(staffMember.name) : schedule.staff_name || ''}
                      </td>
                      <td>{schedule.area || ''}</td>
                      <td>{schedule.transport || ''}</td>
                      <td>{schedule.co_worker || ''}</td>
                      <td>{schedule.request_number || ''}</td>
                      <td className="print-memo-cell">
                        <textarea
                          className="print-memo-textarea no-print"
                          placeholder="印刷用メモを入力..."
                          value={memos[String(schedule.id)] || ''}
                          onChange={(e) => {
                            setMemos({
                              ...memos,
                              [String(schedule.id)]: e.target.value
                            });
                          }}
                        />
                        <span className="print-memo-display">
                          {memos[String(schedule.id)] || ''}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
