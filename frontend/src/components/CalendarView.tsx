import React, { useState, useRef } from 'react';
import type { Schedule, Staff, WorkType } from '../types';
import { getShortName } from '../types';

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Plus } from 'lucide-react';
import './CalendarView.css';

// ローカルタイムゾーン基準で YYYY-MM-DD 形式の日付文字列を生成する
const getLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

interface CellCoordinate {
  dateStr: string;
  rowIndex: number;
  field: keyof Schedule;
}

interface GroupedSchedule {
  key: string;
  work_type: string;
  target_time: string | null;
  property_name: string;
  staff_names: string[];
  items: Schedule[];
}

const groupFreeSpaceSchedules = (schedulesList: Schedule[]): GroupedSchedule[] => {
  const groups: Record<string, GroupedSchedule> = {};
  
  schedulesList.forEach(s => {
    const isHoliday = s.work_type === '休暇';
    const groupKey = isHoliday 
      ? (s.work_type || '休暇') 
      : `${s.work_type || '社内'}-${s.target_time || '指定なし'}-${s.property_name}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: groupKey,
        work_type: s.work_type || '社内',
        target_time: s.target_time,
        property_name: s.property_name,
        staff_names: [],
        items: []
      };
    }
    
    const isAlreadyAdded = groups[groupKey].items.some(item => item.id === s.id);
    if (!isAlreadyAdded) {
      if (s.staff_name && !groups[groupKey].staff_names.includes(s.staff_name)) {
        groups[groupKey].staff_names.push(s.staff_name);
      }
      groups[groupKey].items.push(s);
    }
  });
  
  return Object.values(groups);
};

const isTempSchedule = (sched: Schedule) => {
  return typeof sched.id === 'string' && sched.id.startsWith('temp-');
};

// 対象月の全週のデータを生成する (月曜日開始)
const getWeeksInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  // 月の1日
  const firstDay = new Date(year, month, 1);
  // 月の末日
  const lastDay = new Date(year, month + 1, 0);

  // 第1週の月曜日を計算
  const firstDayOfWeek = firstDay.getDay();
  const firstWeekMondayDiff = firstDay.getDate() - firstDayOfWeek + (firstDayOfWeek === 0 ? -6 : 1);
  const startOfFirstWeek = new Date(year, month, firstWeekMondayDiff);

  // 最終週の日曜日を計算
  const lastDayOfWeek = lastDay.getDay();
  const lastWeekSundayDiff = lastDay.getDate() + (lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek);
  const endOfLastWeek = new Date(year, month, lastWeekSundayDiff);

  // 週のリストを生成
  const weeksList = [];
  let currentWeekStart = new Date(startOfFirstWeek);

  while (currentWeekStart <= endOfLastWeek) {
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      const dateStr = getLocalDateString(d);
      return {
        date: d,
        dateStr,
        dayName: ['月', '火', '水', '木', '金', '土', '日'][i]
      };
    });
    weeksList.push(weekDays);
    
    // 次の週へ進む
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return weeksList;
};

// 2025年〜2027年の日本の祝日・振替休日マップ
const JAPANESE_HOLIDAYS_MAP: Record<string, string> = {
  // 2025年
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日', '2025-02-23': '天皇誕生日', '2025-02-24': '振替休日',
  '2025-03-20': '春分の日', '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日', '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日', '2025-07-21': '海の日', '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日', '2025-11-23': '勤労感謝の日', '2025-11-24': '振替休日',
  // 2026年
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日', '2026-03-21': '春分の日',
  '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日', '2026-05-06': '振替休日',
  '2026-07-20': '海の日', '2026-08-11': '山の日', '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  // 2027年
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日', '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日',
  '2027-03-22': '振替休日', '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日', '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日', '2027-08-11': '山の日', '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日'
};

const parseTSV = (text: string): string[][] => {
  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === '\t') {
        row.push(field);
        field = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        row.push(field);
        result.push(row);
        row = [];
        field = '';
      } else if (char === '\n') {
        row.push(field);
        result.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    result.push(row);
  }

  return result
    .map(r => r.map(cell => cell.trim()))
    .filter(r => r.some(cell => cell !== ''));
};

interface CalendarViewProps {
  schedules: Schedule[];
  staff: Staff[];
  onOpenAddModal: (date: string) => void;
  onOpenEditModal: (schedule: Schedule) => void;
  onSave: (scheduleData: Partial<Schedule>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  workTypes: WorkType[];
  onTransferSchedules?: (date: string) => Promise<void>;
  onOpenPasteImportModal: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  schedules,
  staff,
  onOpenAddModal,
  onOpenEditModal,
  onSave,
  onDelete,
  workTypes,
  onTransferSchedules,
  onOpenPasteImportModal,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateInputRef = useRef<HTMLInputElement>(null);

  const triggerDatePicker = () => {
    if (dateInputRef.current) {
      if (typeof dateInputRef.current.showPicker === 'function') {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.click();
      }
    }
  };

  // クイック追加用の状態変数
  const [activeAddFormDate, setActiveAddFormDate] = useState<string | null>(null);
  const [quickWorkType, setQuickWorkType] = useState('休暇');
  const [quickStaffIds, setQuickStaffIds] = useState<number[]>([]);
  const [showStaffDropdown, setShowStaffDropdown] = useState<string | null>(null);
  const [quickTargetTime, setQuickTargetTime] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  
  // グループ編集ポップアップ用
  const [activePopupGroup, setActivePopupGroup] = useState<GroupedSchedule | null>(null);
  const [activePopupDate, setActivePopupDate] = useState<string | null>(null);
  const [popupStaffIds, setPopupStaffIds] = useState<number[]>([]);
  const [popupTargetTime, setPopupTargetTime] = useState('');
  const [isPopupSubmitting, setIsPopupSubmitting] = useState(false);

  // === インライン編集・コピペ管理用のステート群 ===
  const [editingCell, setEditingCell] = useState<{ id: number | string; field: keyof Schedule } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ id: number | string; field: keyof Schedule } | null>(null);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | string | null>(null);
  const [selectedEmptyCell, setSelectedEmptyCell] = useState<{ date: string; staffId: number } | null>(null);
  const [copiedSchedule, setCopiedSchedule] = useState<Schedule | null>(null);

  // 複数セル矩形ドラッグ選択用のステート
  const [selectionStart, setSelectionStart] = useState<CellCoordinate | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellCoordinate | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    schedule?: Schedule;
    dateStr?: string;
    staffId?: number;
  } | null>(null);

  const weeks = getWeeksInMonth(currentDate);
  const calendarDates = weeks.flatMap(week => week.map(d => d.dateStr));

  const FIELD_ORDER: (keyof Schedule)[] = [
    'type',
    'box',
    'unit_number',
    'property_name',
    'work_type',
    'description',
    'target_time',
    'staff_name',
    'area',
    'prefecture',
    'transport',
    'co_worker',
    'request_number',
    'time_limit',
    'course',
    'notes'
  ];

  const getColAbsoluteIndex = (dateStr: string, field: keyof Schedule) => {
    const dateIdx = calendarDates.indexOf(dateStr);
    const fieldIdx = FIELD_ORDER.indexOf(field);
    return dateIdx * FIELD_ORDER.length + fieldIdx;
  };

  const getSortedDaySchedules = (targetDate: string): Schedule[] => {
    const actualSchedules = schedules.filter(s => s.date === targetDate);

    const holidayStaffIds = new Set<number>();
    const holidayStaffNames = new Set<string>();
    const holidaySchedules: Schedule[] = [];
    actualSchedules.forEach(s => {
      const isHolidayType = s.work_type === '休暇';
      if (isHolidayType) {
        if (s.staff_id) holidayStaffIds.add(s.staff_id);
        if (s.staff_name) holidayStaffNames.add(s.staff_name.trim());
        holidaySchedules.push(s);
      }
    });

    const internalWorkTypes = workTypes
      .filter(t => t.is_internal === 1 && t.name !== '休暇')
      .map(t => t.name);

    const displaySchedules = actualSchedules.filter(s => {
      const isHolidayType = s.work_type === '休暇';
      const isInternalType = s.work_type && internalWorkTypes.includes(s.work_type);
      
      if (isHolidayType || isInternalType) return false;
      if (s.staff_id && holidayStaffIds.has(s.staff_id)) return false;
      if (s.staff_name && holidayStaffNames.has(s.staff_name.trim())) return false;
      
      return true;
    });

    const blended = [...displaySchedules].map(s => {
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

    const activeStaffs = staff.filter(st => st.default_course && st.is_active !== 0);
    activeStaffs.forEach(stItem => {
      if (holidayStaffIds.has(stItem.id) || holidayStaffNames.has(stItem.name.trim())) {
        return;
      }

      const hasScheduleForThisCourse = displaySchedules.some(s => 
        s.status !== 'cancelled' && (
          (s.course && String(s.course).trim() === String(stItem.default_course).trim()) ||
          (s.staff_id === stItem.id || (s.staff_name && s.staff_name.trim() === stItem.name.trim()))
        )
      );

      if (!hasScheduleForThisCourse) {
        const courseNum = Number(stItem.default_course);
        let divisionVal = '';
        if (courseNum >= 1 && courseNum <= 26) {
          divisionVal = 'FTS';
        } else if (courseNum >= 90 && courseNum <= 95) {
          divisionVal = '委託';
        }
        
        blended.push({
          id: `temp-${stItem.name}-${targetDate}`,
          status: 'free',
          division: divisionVal,
          date: targetDate,
          staff_id: stItem.id,
          staff_name: stItem.name,
          course: stItem.default_course || '',
          work_type: 'フリー',
          type: '',
          property_name: '',
          box: '',
          unit_number: '',
          description: '',
          target_time: '',
          area: '',
          prefecture: '',
          transport: '',
          co_worker: '',
          request_number: '',
          time_limit: '',
          result: '',
          notes: '',
          disorder_type: null,
          level: null,
          level_3: null,
          created_at: '',
          updated_at: ''
        } as Schedule);
      }
    });

    for (let i = 0; i < 3; i++) {
      blended.push({
        id: `temp-unassigned-${i}-${targetDate}`,
        status: 'free',
        division: '未定',
        date: targetDate,
        staff_id: null,
        staff_name: '',
        course: '',
        work_type: 'フリー',
        type: '',
        property_name: '',
        box: '',
        unit_number: '',
        description: '',
        target_time: '',
        area: '',
        prefecture: '',
        transport: '',
        co_worker: '',
        request_number: '',
        time_limit: '',
        result: '',
        notes: '',
        disorder_type: null,
        level: null,
        level_3: null,
        created_at: '',
        updated_at: ''
      } as Schedule);
    }

    blended.sort((a, b) => {
      // キャンセルされた予定は常に最下部に配置
      const aCancelled = a.status === 'cancelled';
      const bCancelled = b.status === 'cancelled';
      if (aCancelled !== bCancelled) {
        return aCancelled ? 1 : -1;
      }

      const getDivPriority = (div: string | null) => {
        if (div === 'FTS') return 1;
        if (div === '委託') return 2;
        if (div === '未定' || !div) return 4;
        return 3;
      };

      const aPriority = getDivPriority(a.division);
      const bPriority = getDivPriority(b.division);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aCourse = Number(a.course) || 999;
      const bCourse = Number(b.course) || 999;
      return aCourse - bCourse;
    });

    return blended;
  };

  const getCellSelectionStatus = (
    dateStr: string,
    rowIndex: number,
    field: keyof Schedule
  ) => {
    if (!selectionStart) {
      return { isSelected: false, borderTop: false, borderBottom: false, borderLeft: false, borderRight: false };
    }

    const end = selectionEnd || selectionStart;

    const startCol = getColAbsoluteIndex(selectionStart.dateStr, selectionStart.field);
    const endCol = getColAbsoluteIndex(end.dateStr, end.field);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    const curCol = getColAbsoluteIndex(dateStr, field);

    const minRow = Math.min(selectionStart.rowIndex, end.rowIndex);
    const maxRow = Math.max(selectionStart.rowIndex, end.rowIndex);

    const isSelected = rowIndex >= minRow && rowIndex <= maxRow && curCol >= minCol && curCol <= maxCol;

    if (!isSelected) {
      return { isSelected: false, borderTop: false, borderBottom: false, borderLeft: false, borderRight: false };
    }

    return {
      isSelected,
      borderTop: rowIndex === minRow,
      borderBottom: rowIndex === maxRow,
      borderLeft: curCol === minCol,
      borderRight: curCol === maxCol
    };
  };

  const getSelectionClassName = (dateStr: string, rowIndex: number, field: keyof Schedule) => {
    const status = getCellSelectionStatus(dateStr, rowIndex, field);
    if (!status.isSelected) return '';
    
    let classes = 'selected-grid-cell';
    if (status.borderTop) classes += ' selected-border-top';
    if (status.borderBottom) classes += ' selected-border-bottom';
    if (status.borderLeft) classes += ' selected-border-left';
    if (status.borderRight) classes += ' selected-border-right';
    return classes;
  };

  const handleCellMouseDown = (
    e: React.MouseEvent,
    dateStr: string,
    rowIndex: number,
    field: keyof Schedule,
    scheduleId: number | string
  ) => {
    if (e.button !== 0) return; // 左クリックのみ
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    const coord = { dateStr, rowIndex, field };
    setSelectionStart(coord);
    setSelectionEnd(coord);
    setIsSelecting(true);

    setSelectedCell({ id: scheduleId, field });
    setSelectedScheduleId(scheduleId);
    setSelectedEmptyCell(null);
  };

  const handleCellMouseEnter = (dateStr: string, rowIndex: number, field: keyof Schedule) => {
    if (!isSelecting) return;
    setSelectionEnd({ dateStr, rowIndex, field });
  };

  // コピペ貼り付け処理
  const handlePaste = async (targetDate: string, targetStaffId: number) => {
    if (!copiedSchedule) return;
    const matchedStaff = staff.find(st => st.id === targetStaffId);
    
    // コピペ元の予定データ（一部除外・調整）
    const payload: Partial<Schedule> = {
      status: copiedSchedule.status || 'free',
      division: copiedSchedule.division,
      type: copiedSchedule.type,
      box: copiedSchedule.box,
      unit_number: copiedSchedule.unit_number,
      property_name: copiedSchedule.property_name,
      work_type: copiedSchedule.work_type,
      description: copiedSchedule.description,
      target_time: copiedSchedule.target_time,
      date: targetDate,
      staff_id: targetStaffId,
      staff_name: matchedStaff ? matchedStaff.name : copiedSchedule.staff_name,
      area: copiedSchedule.area,
      prefecture: copiedSchedule.prefecture,
      transport: copiedSchedule.transport,
      co_worker: copiedSchedule.co_worker,
      request_number: copiedSchedule.request_number,
      time_limit: copiedSchedule.time_limit,
      course: matchedStaff ? matchedStaff.default_course : copiedSchedule.course,
      result: '',
      notes: copiedSchedule.notes,
      disorder_type: copiedSchedule.disorder_type,
      level: copiedSchedule.level,
      level_3: copiedSchedule.level_3,
      is_transferred: 0 // 新規登録なので未移行
    };
    
    try {
      await onSave(payload);
    } catch (err) {
      console.error('Failed to paste schedule:', err);
      alert('貼り付けに失敗しました。');
    }
  };

  // インライン直接編集保存処理
  const handleInlineSave = async (scheduleId: number | string, field: keyof Schedule, value: string) => {
    setEditingCell(null);
    const isTemp = typeof scheduleId === 'string' && scheduleId.startsWith('temp-');
    
    if (isTemp) {
      const parts = String(scheduleId).split('-');
      const isUnassigned = String(scheduleId).startsWith('temp-unassigned-');
      const tempStaffName = isUnassigned ? '' : parts[1];
      const tempDate = isUnassigned ? parts.slice(3).join('-') : parts.slice(2).join('-');
      const matchedStaff = tempStaffName ? staff.find(st => st.name === tempStaffName) : undefined;

      const finalPropertyName = field === 'property_name'
        ? (value.trim() || '（物件名未定）')
        : '（物件名未定）';

      const payload: Partial<Schedule> = {
        status: 'free',
        date: tempDate,
        staff_id: matchedStaff ? matchedStaff.id : null,
        staff_name: matchedStaff ? matchedStaff.name : '',
        course: matchedStaff ? (matchedStaff.default_course || '') : '',
        division: matchedStaff && matchedStaff.default_course && Number(matchedStaff.default_course) >= 90 ? '委託' : (matchedStaff ? 'FTS' : '未定'),
        work_type: 'フリー',
        property_name: finalPropertyName,
        is_transferred: 0,
        [field]: value
      };
      
      try {
        await onSave(payload);
      } catch (err) {
        console.error('Failed to create schedule via inline edit:', err);
        alert('登録に失敗しました。');
      }
    } else {
      const payload: Partial<Schedule> = {
        id: Number(scheduleId),
        [field]: value
      };
      
      try {
        await onSave(payload);
      } catch (err) {
        console.error('Failed to update schedule via inline edit:', err);
        alert('保存に失敗しました。');
      }
    }
  };

  // ドラッグのグローバル監視
  React.useEffect(() => {
    const handleMouseUpGlobal = () => {
      setIsSelecting(false);
    };
    window.addEventListener('mouseup', handleMouseUpGlobal);
    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [isSelecting]);

  // キーボードショートカットおよびクリップボード貼り付けの監視
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl + C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectionStart) {
          const end = selectionEnd || selectionStart;

          const startCol = getColAbsoluteIndex(selectionStart.dateStr, selectionStart.field);
          const endCol = getColAbsoluteIndex(end.dateStr, end.field);
          const minCol = Math.min(startCol, endCol);
          const maxCol = Math.max(startCol, endCol);

          const minRow = Math.min(selectionStart.rowIndex, end.rowIndex);
          const maxRow = Math.max(selectionStart.rowIndex, end.rowIndex);

          const isSingleDay = selectionStart.dateStr === end.dateStr;
          const colDiff = maxCol - minCol;
          const isEntireRowSelected = isSingleDay && minRow === maxRow && colDiff === (FIELD_ORDER.length - 1) && (minCol % FIELD_ORDER.length === 0);

          if (isEntireRowSelected) {
            // 1行全体が選択されている場合：予定全体の複製モード
            const targetDateStr = selectionStart.dateStr;
            const daySchedules = getSortedDaySchedules(targetDateStr);
            const sched = daySchedules[minRow];
            if (sched && !isTempSchedule(sched)) {
              setCopiedSchedule(sched);
              const rowText = FIELD_ORDER.map(field => String(sched[field] || '')).join('\t');
              navigator.clipboard.writeText(rowText).catch(err => {
                console.error('Failed to write to clipboard:', err);
              });
              e.preventDefault();
              return;
            }
          }

          // 一部セルのコピー（行全体のコピーは解除）
          setCopiedSchedule(null);

          let clipboardText = '';
          for (let r = minRow; r <= maxRow; r++) {
            let rowText = '';
            for (let c = minCol; c <= maxCol; c++) {
              const dateIdx = Math.floor(c / FIELD_ORDER.length);
              const fieldIdx = c % FIELD_ORDER.length;
              const dateStr = calendarDates[dateIdx];
              const field = FIELD_ORDER[fieldIdx];

              const daySchedules = getSortedDaySchedules(dateStr);
              const sched = daySchedules[r];

              const val = sched ? String(sched[field] || '') : '';
              rowText += (rowText ? '\t' : '') + val;
            }
            clipboardText += (clipboardText ? '\n' : '') + rowText;
          }

          navigator.clipboard.writeText(clipboardText).catch(err => {
            console.error('Failed to write to clipboard:', err);
          });
          e.preventDefault();
        }
      }
    };

    const handlePasteEvent = async (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const text = e.clipboardData?.getData('text/plain');

      if (text && text.trim() !== '') {
        e.preventDefault();

        let startCoord = selectionStart;
        if (!startCoord && selectedCell) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedCell.id);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: selectedCell.field };
              break;
            }
          }
        }

        if (!startCoord) {
          alert('貼り付け先（セル）を選択してから貼り付けてください。');
          return;
        }

        const startColAbs = getColAbsoluteIndex(startCoord.dateStr, startCoord.field);
        const startRowIndex = startCoord.rowIndex;

        const parsedRows = parseTSV(text);

        const promises: Promise<void>[] = [];
        const rowUpdates: Record<string, {
          targetSched: Schedule;
          targetDateStr: string;
          targetRowIndex: number;
          isTargetTemp: boolean;
          updateFields: any;
          nextStaffId: number | null;
          nextStaffName: string;
          nextCourse: string | null;
          nextDivision: string | null;
        }> = {};

        try {
          for (let rOffset = 0; rOffset < parsedRows.length; rOffset++) {
            const cols = parsedRows[rOffset];
            const targetRowIndex = startRowIndex + rOffset;

            for (let cOffset = 0; cOffset < cols.length; cOffset++) {
              const val = cols[cOffset];
              const targetColAbs = startColAbs + cOffset;

              const dateIdx = Math.floor(targetColAbs / FIELD_ORDER.length);
              const fieldIdx = targetColAbs % FIELD_ORDER.length;

              if (dateIdx >= calendarDates.length) continue;
              const targetDateStr = calendarDates[dateIdx];
              const targetField = FIELD_ORDER[fieldIdx];

              const key = `${targetDateStr}-${targetRowIndex}`;

              if (!rowUpdates[key]) {
                const blended = getSortedDaySchedules(targetDateStr);
                let targetSched: Schedule | undefined = blended[targetRowIndex];

                if (!targetSched) {
                  targetSched = {
                    id: `temp-unassigned-extra-${targetRowIndex}-${targetDateStr}`,
                    status: 'free',
                    division: '未定',
                    date: targetDateStr,
                    staff_id: null,
                    staff_name: '',
                    course: '',
                    work_type: 'フリー',
                    property_name: ''
                  } as Schedule;
                }

                const isTargetTemp = typeof targetSched.id === 'string' && targetSched.id.startsWith('temp-');
                rowUpdates[key] = {
                  targetSched,
                  targetDateStr,
                  targetRowIndex,
                  isTargetTemp,
                  updateFields: {},
                  nextStaffId: isTargetTemp ? targetSched.staff_id : (targetSched.staff_id || null),
                  nextStaffName: isTargetTemp ? (targetSched.staff_name || '') : (targetSched.staff_name || ''),
                  nextCourse: isTargetTemp ? targetSched.course : (targetSched.course || null),
                  nextDivision: isTargetTemp ? targetSched.division : (targetSched.division || '未定')
                };
              }

              const rowData = rowUpdates[key];
              rowData.updateFields[targetField] = val;

              if (targetField === 'staff_name') {
                const trimmedName = val.trim();
                if (trimmedName !== '') {
                  const matchedStaff = staff.find(st => st.name === trimmedName);
                  if (matchedStaff) {
                    rowData.nextStaffId = matchedStaff.id;
                    rowData.nextStaffName = matchedStaff.name;
                    rowData.nextCourse = matchedStaff.default_course || '';
                    const cNum = Number(rowData.nextCourse);
                    if (rowData.nextCourse !== '' && !isNaN(cNum)) {
                      rowData.nextDivision = (cNum >= 1 && cNum <= 26) ? 'FTS' : '委託';
                    }
                  } else {
                    rowData.nextStaffId = null;
                    rowData.nextStaffName = trimmedName;
                    rowData.nextCourse = '';
                    rowData.nextDivision = '未定';
                  }
                } else {
                  rowData.nextStaffId = null;
                  rowData.nextStaffName = '';
                  rowData.nextCourse = '';
                  rowData.nextDivision = '未定';
                }
                rowData.updateFields.staff_id = rowData.nextStaffId;
                rowData.updateFields.staff_name = rowData.nextStaffName;
                rowData.updateFields.course = rowData.nextCourse;
                rowData.updateFields.division = rowData.nextDivision;
              }

              if (targetField === 'course') {
                rowData.nextCourse = val;
                const cNum = Number(rowData.nextCourse);
                if (rowData.nextCourse !== '' && !isNaN(cNum)) {
                  rowData.nextDivision = (cNum >= 1 && cNum <= 26) ? 'FTS' : '委託';
                } else {
                  rowData.nextDivision = '未定';
                }
                rowData.updateFields.course = rowData.nextCourse;
                rowData.updateFields.division = rowData.nextDivision;
              }
            }
          }

          // 二重ループ完了後に、行ごとに1回だけ onSave を呼び出す
          for (const key of Object.keys(rowUpdates)) {
            const rowData = rowUpdates[key];
            if (rowData.isTargetTemp) {
              const payload: Partial<Schedule> = {
                status: 'confirmed',
                date: rowData.targetDateStr,
                work_type: 'フリー',
                property_name: '（物件名未定）',
                is_transferred: 0,
                ...rowData.updateFields,
                staff_id: rowData.nextStaffId,
                staff_name: rowData.nextStaffName,
                course: rowData.nextCourse,
                division: rowData.nextDivision
              };
              promises.push(onSave(payload));
            } else {
              const payload: Partial<Schedule> = {
                id: Number(rowData.targetSched.id),
                ...rowData.updateFields,
                staff_id: rowData.nextStaffId,
                staff_name: rowData.nextStaffName,
                course: rowData.nextCourse,
                division: rowData.nextDivision
              };
              promises.push(onSave(payload));
            }
          }

          if (promises.length > 0) {
            await Promise.all(promises);
          }
        } catch (err) {
          console.error('Failed to paste cells:', err);
          alert('貼り付けに失敗しました。');
        }
      } else if (copiedSchedule) {
        // クリップボードが空で、システム内コピーが存在する場合のみ予定全体を複製
        e.preventDefault();

        let startCoord = selectionStart;
        if (!startCoord && selectedCell) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedCell.id);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: selectedCell.field };
              break;
            }
          }
        }

        if (startCoord) {
          const blended = getSortedDaySchedules(startCoord.dateStr);
          const targetSched = blended[startCoord.rowIndex];
          if (targetSched) {
            const matchedStaff = staff.find(st => st.id === targetSched.staff_id || (st.name && st.name === targetSched.staff_name));
            const tStaffId = matchedStaff ? matchedStaff.id : (targetSched.staff_id || 0);
            await handlePaste(startCoord.dateStr, tStaffId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePasteEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePasteEvent);
    };
  }, [selectionStart, selectionEnd, isSelecting, selectedScheduleId, copiedSchedule, selectedEmptyCell, selectedCell, schedules, staff, workTypes]);

  // コンテキストメニュー非表示用
  React.useEffect(() => {
    const handleWindowClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  // currentDate が変更された際（今日ボタンや日付指定ジャンプ時）に、該当する日のカラムまで自動スクロールする
  React.useEffect(() => {
    const dateStr = getLocalDateString(currentDate);
    const timer = setTimeout(() => {
      const element = document.getElementById(`day-block-${dateStr}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
        // ハイライト効果を適用
        element.classList.add('jump-highlight');
        setTimeout(() => {
          element.classList.remove('jump-highlight');
        }, 1500);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentDate]);



  const handlePrevMonth = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(d);
  };

  const handleNextMonth = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const renderEditableCell = (
    schedule: Schedule,
    rowIndex: number,
    field: keyof Schedule,
    className: string,
    title?: string,
    style?: React.CSSProperties
  ) => {
    const isEditing = editingCell?.id === schedule.id && editingCell?.field === field;
    const schedId = schedule.id;

    if (isEditing) {
      if (field === 'work_type') {
        return (
          <td className={className} style={style}>
            <select
              className="inline-edit-select"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => handleInlineSave(schedId, field, editingValue)}
              autoFocus
            >
              {workTypes.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </td>
        );
      }
      
      return (
        <td className={className} style={style}>
          <input
            type="text"
            className="inline-edit-input"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => handleInlineSave(schedId, field, editingValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInlineSave(schedId, field, editingValue);
              } else if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
            autoFocus
          />
        </td>
      );
    }

    const value = schedule[field];
    const selectionClass = getSelectionClassName(schedule.date, rowIndex, field);
    const cellClass = `${className} ${selectionClass}`;
    
    if (field === 'staff_name') {
      const matchedStaff = staff.find(st => st.id === schedule.staff_id || st.name === value);
      const avatarUrl = matchedStaff?.avatar_url;
      const isUnassigned = !value;

      return (
        <td 
          className={cellClass} 
          style={style}
          title={title || undefined}
          onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
          onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
          onDoubleClick={() => {
            setEditingCell({ id: schedId, field });
            setEditingValue(String(value || ''));
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={String(value)} 
                style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
              />
            ) : !isUnassigned ? (
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
                {getShortName(String(value)).substring(0, 1)}
              </div>
            ) : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getShortName(String(value || ''))}
            </span>
          </div>
        </td>

      );
    }
    
    if (field === 'property_name') {
      const isTemp = typeof schedId === 'string' && (schedId.startsWith('temp-') || schedId.startsWith('dummy-'));
      return (
        <td 
          className={cellClass} 
          style={style}
          title={title || undefined}
          onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
          onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
          onDoubleClick={() => {
            setEditingCell({ id: schedId, field });
            setEditingValue(String(value || ''));
          }}
        >
          <div className="property-cell-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '4px' }}>
            <span className="property-cell-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {String(value || '')}
            </span>
            {!isTemp && (
              <button
                type="button"
                className="cell-edit-modal-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEditModal(schedule);
                }}
                title="詳細を編集 (モーダル)"
              >
                <Edit2 size={12} />
              </button>
            )}
          </div>
        </td>
      );
    }

    return (
      <td 
        className={cellClass} 
        style={style}
        title={title || undefined}
        onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
        onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
        onDoubleClick={() => {
          if (field === 'staff_id' || field === 'division') {
            return;
          }
          setEditingCell({ id: schedId, field });
          setEditingValue(String(value || ''));
        }}
      >
        {String(value || '')}
      </td>
    );
  };

  const handleQuickAdd = async (dateStr: string) => {
    if (quickStaffIds.length === 0) {
      alert('担当者を1人以上選択してください。');
      return;
    }

    if (isQuickAdding) return;
    setIsQuickAdding(true);

    const isHoliday = quickWorkType === '休暇';
    const propertyName = isHoliday ? '（休暇）' : '（社内用務）';

    try {
      const uniqueStaffIds = Array.from(new Set(quickStaffIds));

      for (const staffId of uniqueStaffIds) {
        const matchedStaff = staff.find(st => st.id === staffId);
        if (!matchedStaff) continue;

        const payload: Partial<Schedule> = {
          status: 'confirmed',
          date: dateStr,
          work_type: quickWorkType,
          staff_id: matchedStaff.id,
          staff_name: matchedStaff.name,
          target_time: quickTargetTime.trim() || (isHoliday ? '終日' : '指定なし'),
          property_name: propertyName,
          course: matchedStaff.default_course || null,
          division: matchedStaff.default_course && Number(matchedStaff.default_course) >= 90 ? '委託' : 'FTS'
        };
        await onSave(payload);
      }

      setActiveAddFormDate(null);
      setQuickStaffIds([]);
      setShowStaffDropdown(null);
    } catch (err) {
      console.error('Failed to quick add schedules:', err);
      alert('簡易登録に失敗しました。');
    } finally {
      setIsQuickAdding(false);
    }
  };

  const handleBadgeClick = (dateStr: string, group: GroupedSchedule) => {
    // 常にその場でポップアップを表示する（詳細モーダルは開かない）
    const isSameGroup = activePopupGroup?.key === group.key && activePopupDate === dateStr;
    if (isSameGroup) {
      setActivePopupGroup(null);
      setActivePopupDate(null);
    } else {
      setActivePopupGroup(group);
      setActivePopupDate(dateStr);
      
      // アサインされているスタッフIDリストをコピー
      const assignedIds = group.items
        .map(item => item.staff_id)
        .filter((id): id is number => id !== null);
      setPopupStaffIds(assignedIds);
      setPopupTargetTime(group.items[0]?.target_time || '');
    }
  };

  const handleUpdateGroupedSchedules = async (dateStr: string, group: GroupedSchedule) => {
    if (isPopupSubmitting) return;
    setIsPopupSubmitting(true);

    try {
      const isHoliday = group.work_type === '休暇';
      const propertyName = isHoliday ? '（休暇）' : '（社内用務）';

      // 1. 元アサインされていたスタッフのIDリスト
      const originalStaffIds = group.items
        .map(item => item.staff_id)
        .filter((id): id is number => id !== null);

      // 2. 削除対象のレコード (元のIDにあって、選択されたIDにないもの)
      const idsToDelete = originalStaffIds.filter(id => !popupStaffIds.includes(id));
      const itemsToDelete = group.items.filter(item => item.staff_id !== null && idsToDelete.includes(item.staff_id));

      // 3. 新規登録対象のスタッフ (選択されたIDにあって、元のIDにないもの)
      const idsToAdd = popupStaffIds.filter(id => !originalStaffIds.includes(id));

      // 4. 更新対象のレコード (元にも新しいリストにもあって、時間/備考が変更されたもの)
      const originalTime = group.items[0]?.target_time || '';
      const isTimeChanged = popupTargetTime.trim() !== originalTime.trim();
      const idsToUpdate = originalStaffIds.filter(id => popupStaffIds.includes(id));
      const itemsToUpdate = group.items.filter(item => item.staff_id !== null && idsToUpdate.includes(item.staff_id));

      // --- 削除の実行 ---
      for (const item of itemsToDelete) {
        if (item.id) {
          await onDelete(Number(item.id));
        }
      }

      // --- 新規登録の実行 ---
      for (const staffId of idsToAdd) {
        const matchedStaff = staff.find(st => st.id === staffId);
        if (!matchedStaff) continue;

        const payload: Partial<Schedule> = {
          status: 'confirmed',
          date: dateStr,
          work_type: group.work_type,
          staff_id: matchedStaff.id,
          staff_name: matchedStaff.name,
          target_time: popupTargetTime.trim() || (isHoliday ? '終日' : '指定なし'),
          property_name: propertyName,
          course: matchedStaff.default_course || null,
          division: matchedStaff.default_course && Number(matchedStaff.default_course) >= 90 ? '委託' : 'FTS'
        };
        await onSave(payload);
      }

      // --- 時間更新の実行 (変更があった場合のみ) ---
      if (isTimeChanged) {
        for (const item of itemsToUpdate) {
          const payload: Partial<Schedule> = {
            ...item,
            target_time: popupTargetTime.trim() || (isHoliday ? '終日' : '指定なし'),
          };
          await onSave(payload);
        }
      }

      // 完了したらポップアップを閉じる
      setActivePopupGroup(null);
      setActivePopupDate(null);
    } catch (err) {
      console.error('Failed to update grouped schedules:', err);
      alert('予定の更新に失敗しました。');
    } finally {
      setIsPopupSubmitting(false);
    }
  };

  const handleDeleteAllGroupedSchedules = async (group: GroupedSchedule) => {
    if (isPopupSubmitting) return;
    setIsPopupSubmitting(true);

    try {
      for (const item of group.items) {
        if (item.id) {
          await onDelete(Number(item.id));
        }
      }
      setActivePopupGroup(null);
      setActivePopupDate(null);
    } catch (err) {
      console.error('Failed to delete all grouped schedules:', err);
      alert('予定の削除に失敗しました。');
    } finally {
      setIsPopupSubmitting(false);
    }
  };

  const formatJapaneseMonth = () => {
    return `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`;
  };

  const getPrevMonthName = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    return `${d.getMonth() + 1}月`;
  };

  const getNextMonthName = () => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    return `${d.getMonth() + 1}月`;
  };

  return (
    <div className="matrix-board-container card">
      <div className="matrix-header">
        <div className="matrix-title-nav">
          <h2>日付並列カレンダーグリッド</h2>
          <span className="matrix-date-range">{formatJapaneseMonth()}</span>
          <div className="matrix-nav-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm-nav" onClick={handlePrevMonth} title={`${getPrevMonthName()}へ移動`}>
              <ChevronLeft size={16} /> {getPrevMonthName()}
            </button>
            <button className="btn btn-secondary btn-sm-nav" onClick={handleNextMonth} title={`${getNextMonthName()}へ移動`}>
              {getNextMonthName()} <ChevronRight size={16} />
            </button>
            <div className="date-picker-wrapper" onClick={triggerDatePicker} title="クリックして日付を選択" style={{ cursor: 'pointer' }}>
              <input
                ref={dateInputRef}
                type="date"
                className="date-picker-input"
                value={currentDate.toISOString().split('T')[0]}
                onChange={(e) => {
                  if (e.target.value) {
                    setCurrentDate(new Date(e.target.value));
                  }
                }}
              />
              <span className="current-date-display" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', height: '32px', borderRadius: '6px', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--card-bg, #ffffff)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main, #1e293b)' }}>
                <CalendarIcon size={14} style={{ marginRight: '6px' }} />
                日付指定
              </span>
            </div>
            <button className="btn btn-secondary btn-sm-nav" onClick={handleToday}>
              本日
            </button>
            <button 
              className="btn btn-secondary btn-sm-nav" 
              onClick={onOpenPasteImportModal} 
              title="Excelやスプレッドシートからコピーしたデータを貼り付け"
              style={{ marginLeft: '0.25rem' }}
            >
              スプレッドシートから貼り付け
            </button>
            <button 
              className="btn btn-primary btn-sm-nav" 
              onClick={() => onOpenAddModal(getLocalDateString(currentDate))} 
              title="新規予定を追加"
              style={{ marginLeft: '0.25rem' }}
            >
              <Plus size={14} style={{ marginRight: '4px' }} />
              予定を追加
            </button>
          </div>
        </div>
      </div>

      <div className="matrix-table-wrapper">
        {weeks.map((weekDays, weekIndex) => {
          // 各曜日のスケジュール配列と休みスケジュールの配列を取得
          const parsedDaysData = weekDays.map(day => {
            const actualSchedules = schedules.filter(s => s.date === day.dateStr);

            // その日に「休み」または「公休」が登録されているスタッフのIDと名前を収集、休み予定レコード自体も保存
            const holidayStaffIds = new Set<number>();
            const holidayStaffNames = new Set<string>();
            const holidaySchedules: Schedule[] = [];
            actualSchedules.forEach(s => {
              const isHolidayType = s.work_type === '休暇';
              if (isHolidayType) {
                if (s.staff_id) holidayStaffIds.add(s.staff_id);
                if (s.staff_name) holidayStaffNames.add(s.staff_name.trim());
                holidaySchedules.push(s);
              }
            });

            // 社内予定（マスタから is_internal === 1 のものを動的に取得。休暇は既に holidaySchedules で抽出しているため重複を防ぐために除外）
            const internalWorkTypes = workTypes
              .filter(t => t.is_internal === 1 && t.name !== '休暇')
              .map(t => t.name);
            const internalSchedules = actualSchedules.filter(s => 
              s.work_type && internalWorkTypes.includes(s.work_type)
            );

            // フリースペースに表示する全予定
            const freeSpaceSchedules = [...holidaySchedules, ...internalSchedules];

            // グループ化して格納
            const groupedFreeSpaceSchedules = groupFreeSpaceSchedules(freeSpaceSchedules);

            // 共通関数からソート済みのスケジュール一覧（仮想行含む）を取得
            const blended = getSortedDaySchedules(day.dateStr);

            // 移行状態集計用に実スケジュールのみを抽出
            const displaySchedules = actualSchedules.filter(s => {
              const isHolidayType = s.work_type === '休暇';
              const isInternalType = s.work_type && internalWorkTypes.includes(s.work_type);
              
              if (isHolidayType || isInternalType) return false;
              
              if (s.staff_id && holidayStaffIds.has(s.staff_id)) return false;
              if (s.staff_name && holidayStaffNames.has(s.staff_name.trim())) return false;
              
              return true;
            });

            const hasRealSchedules = displaySchedules.length > 0;
            const unprocessedCount = displaySchedules.filter(s => s.is_transferred !== 1).length;
            const transferredCount = displaySchedules.filter(s => s.is_transferred === 1).length;
            const hasUnprocessedTransfer = unprocessedCount > 0;
            const isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;
            const isPartiallyTransferred = transferredCount > 0 && hasUnprocessedTransfer;

            return {
              schedules: blended,
              freeSpaceSchedules: groupedFreeSpaceSchedules,
              hasRealSchedules,
              hasUnprocessedTransfer,
              isAllTransferred,
              unprocessedCount,
              transferredCount,
              isPartiallyTransferred
            };
          });


          // 最多の予定行数を求める (デフォルトで32名いるため、最低でも32行)
          const maxRows = Math.max(...parsedDaysData.map(d => d.schedules.length), 32);
          
          const startDate = weekDays[0].date;
          const endDate = weekDays[6].date;
          const weekLabel = `第 ${weekIndex + 1} 週目 (${startDate.getMonth() + 1}/${startDate.getDate()} 〜 ${endDate.getMonth() + 1}/${endDate.getDate()})`;

          return (
            <div key={weekIndex} className="week-table-block" style={{ marginBottom: weekIndex === weeks.length - 1 ? '0' : '2.5rem' }}>
              <div className="week-title-badge">
                <span>{weekLabel}</span>
              </div>
              <div className="week-days-container">
                {weekDays.map((day, dayIndex) => {
                  const { 
                    schedules: daySchedules, 
                    freeSpaceSchedules, 
                    hasUnprocessedTransfer, 
                    isAllTransferred,
                    unprocessedCount,
                    isPartiallyTransferred 
                  } = parsedDaysData[dayIndex];
                  const isToday = getLocalDateString(new Date()) === day.dateStr;
                  const dayOfWeekNum = day.date.getDay(); // 0: 日曜日, 6: 土曜日, 1-5: 平日
                  const holidayName = JAPANESE_HOLIDAYS_MAP[day.dateStr];
                  const isDayHoliday = !!holidayName;

                  let dayClass = 'weekday-column';
                  if (dayOfWeekNum === 6) dayClass = 'saturday-column';
                  if (dayOfWeekNum === 0 || isDayHoliday) dayClass = 'sunday-column';

                  return (
                    <div 
                      key={day.dateStr} 
                      id={`day-block-${day.dateStr}`}
                      className={`day-column-block ${isToday ? 'today-column' : ''} ${dayClass}`}
                    >
                      <table className="day-calendar-table">
                        <colgroup>
                          <col style={{ width: '65px' }} /> {/* タイプ (見切れ防止のため幅を確保) */}
                          <col style={{ width: '65px' }} /> {/* BOX */}
                          <col style={{ width: '65px' }} /> {/* 号機 */}
                          <col style={{ width: '180px' }} /> {/* 物件名 */}
                          <col style={{ width: '65px' }} /> {/* 種別 */}
                          <col style={{ width: '220px' }} /> {/* 作業内容 */}
                          <col style={{ width: '75px' }} /> {/* 時間 */}
                          <col style={{ width: '100px' }} /> {/* 対応者 */}
                          <col style={{ width: '75px' }} /> {/* エリア */}
                          <col style={{ width: '65px' }} /> {/* 県別 */}
                          <col style={{ width: '65px' }} /> {/* 移動 */}
                          <col style={{ width: '85px' }} /> {/* 同行者 */}
                          <col style={{ width: '100px' }} /> {/* 依頼番号 */}
                          <col style={{ width: '65px' }} /> {/* TIME */}
                          <col style={{ width: '65px' }} /> {/* コース */}
                          <col style={{ width: '130px' }} /> {/* 備考 */}
                        </colgroup>
                        <thead>
                          {/* 1段目ヘッダー: 各曜日の大結合ヘッダー */}
                          <tr>
                            <th 
                              colSpan={16} 
                              className={`matrix-day-header-super ${isToday ? 'today-header' : ''}`}
                            >
                              <div className="day-header-content-super" style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                padding: '4px 8px',
                                position: 'relative',
                                width: '100%',
                                minHeight: '38px'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span className="day-name-super" style={{ color: '#000000', fontWeight: 'bold' }}>
                                    {day.dayName}曜日{holidayName ? `・${holidayName}` : ''}
                                  </span>
                                  <span className="day-date-super" style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 'bold', opacity: 0.9 }}>({day.date.getMonth() + 1}/{day.date.getDate()})</span>
                                </div>
                                <div className="transfer-action-area" style={{
                                  position: 'absolute',
                                  right: '8px',
                                  top: '50%',
                                  transform: 'translateY(-50%)'
                                }}>
                                  {isAllTransferred && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(22, 163, 74, 0.15)', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                                      ✓ 移行済み
                                    </span>
                                  )}
                                  {hasUnprocessedTransfer && onTransferSchedules && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const confirmMsg = isPartiallyTransferred
                                          ? `${day.dateStr} の未反映の予定 (${unprocessedCount}件) を行動予定表に追加移行しますか？`
                                          : `${day.dateStr} の予定 (${unprocessedCount}件) をすべて行動予定表に移行しますか？`;
                                        if (window.confirm(confirmMsg)) {
                                          onTransferSchedules(day.dateStr);
                                        }
                                      }}
                                      className="btn btn-primary"
                                      style={{ 
                                        padding: '2px 6px', 
                                        fontSize: '0.7rem', 
                                        height: '22px', 
                                        lineHeight: 1,
                                        backgroundColor: isPartiallyTransferred ? '#ea580c' : 'var(--primary)',
                                        borderColor: isPartiallyTransferred ? '#ea580c' : 'var(--primary)'
                                      }}
                                    >
                                      {isPartiallyTransferred ? `未反映分を移行 (${unprocessedCount}件)` : `行動予定へ移行 (${unprocessedCount}件)`}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </th>
                          </tr>
                          {/* 1.5段目ヘッダー: フリースペース (常に表示) */}
                          <tr>
                            <th colSpan={16} className="matrix-freespace-header">
                              <div className="freespace-content-wrapper">
                                {freeSpaceSchedules.map((group: GroupedSchedule) => {
                                  const isHoliday = group.work_type === '休暇';
                                  const badgeClass = isHoliday ? 'badge-holiday' : 'badge-internal';
                                  
                                  const staffLabel = group.staff_names.length > 0 ? ` (${group.staff_names.join(', ')})` : '';
                                  const timeLabel = group.target_time ? ` ${group.target_time}` : '';
                                  const showPropName = group.property_name && !['（社内用務）', '（休暇）'].includes(group.property_name);
                                  const descLabel = showPropName ? ` - ${group.property_name}` : '';
                                  
                                  const displayLabel = isHoliday
                                    ? `${group.work_type}:${staffLabel}`
                                    : `${group.work_type}:${timeLabel}${staffLabel}${descLabel}`;

                                  return (
                                    <div key={group.key} className="freespace-badge-container">
                                      <button
                                        type="button"
                                        className={`freespace-badge ${badgeClass}`}
                                        onClick={() => handleBadgeClick(day.dateStr, group)}
                                        title="クリックして予定を編集・取消"
                                      >
                                        {displayLabel}
                                      </button>

                                      {/* 簡易編集ポップアップ */}
                                      {activePopupGroup && activePopupGroup.key === group.key && activePopupDate === day.dateStr && (
                                        <div className="freespace-edit-popup" onClick={(e) => e.stopPropagation()}>
                                          <div className="popup-arrow"></div>
                                          <p className="popup-title">「{activePopupGroup.work_type}」の予定を編集</p>
                                          
                                          {/* 時間/備考の入力 */}
                                          <div className="popup-form-group">
                                            <label className="popup-input-label">時間/備考</label>
                                            <input
                                              type="text"
                                              className="quick-form-control popup-input-time-field"
                                              placeholder="例: 終日, 10:00〜"
                                              value={popupTargetTime}
                                              onChange={(e) => setPopupTargetTime(e.target.value)}
                                              disabled={isPopupSubmitting}
                                            />
                                          </div>
                                          
                                          {/* スタッフのチェックボックスリスト */}
                                          <div className="popup-form-group">
                                            <label className="popup-input-label">担当者 (複数可)</label>
                                            <div className="popup-checkboxes-list">
                                              {staff.filter(st => st.is_active !== 0).map(st => {
                                                const isChecked = popupStaffIds.includes(st.id);
                                                return (
                                                  <label key={st.id} className="popup-checkbox-item">
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      onChange={() => {
                                                        if (isChecked) {
                                                          setPopupStaffIds(popupStaffIds.filter(id => id !== st.id));
                                                        } else {
                                                          setPopupStaffIds([...popupStaffIds, st.id]);
                                                        }
                                                      }}
                                                      disabled={isPopupSubmitting}
                                                    />
                                                    <span>{getShortName(st.name)}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          {/* 操作ボタン */}
                                          <div className="popup-actions-row">
                                            <button
                                              type="button"
                                              className="btn-quick-action btn-quick-submit"
                                              onClick={() => handleUpdateGroupedSchedules(day.dateStr, activePopupGroup)}
                                              disabled={isPopupSubmitting}
                                            >
                                              {isPopupSubmitting ? '更新中...' : '更新'}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-quick-action btn-quick-cancel"
                                              onClick={() => {
                                                setActivePopupGroup(null);
                                                setActivePopupDate(null);
                                              }}
                                              disabled={isPopupSubmitting}
                                            >
                                              キャンセル
                                            </button>
                                          </div>

                                          <div className="popup-divider"></div>

                                          <button
                                            type="button"
                                            className="popup-delete-btn"
                                            onClick={() => {
                                              if (window.confirm('この予定をすべて削除しますか？')) {
                                                handleDeleteAllGroupedSchedules(activePopupGroup);
                                              }
                                            }}
                                            disabled={isPopupSubmitting}
                                          >
                                            予定を完全に削除
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* クイック追加ボタンと簡易入力フォーム */}
                                {activeAddFormDate === day.dateStr ? (
                                  <div className="quick-add-form-inline" onClick={(e) => e.stopPropagation()}>
                                    <select
                                      className="quick-form-control quick-select-worktype"
                                      value={quickWorkType}
                                      onChange={(e) => setQuickWorkType(e.target.value)}
                                    >
                                      {workTypes.filter(t => t.is_internal === 1).map(t => (
                                        <option key={t.id} value={t.name}>{t.name}</option>
                                      ))}
                                    </select>

                                    {/* 複数選択チェックドロップダウン */}
                                    <div className="quick-staff-select-container">
                                      <button
                                        type="button"
                                        className="quick-form-control quick-select-staff-trigger"
                                        onClick={() => setShowStaffDropdown(showStaffDropdown === day.dateStr ? null : day.dateStr)}
                                      >
                                        {quickStaffIds.length === 0 
                                          ? '- 担当者(複数可) -' 
                                          : `${quickStaffIds.length}名選択中`
                                        }
                                      </button>
                                      
                                      {showStaffDropdown === day.dateStr && (
                                        <div className="quick-staff-dropdown-menu">
                                          <div className="dropdown-actions">
                                            <button 
                                              type="button" 
                                              className="dropdown-action-btn"
                                              onClick={() => {
                                                const activeIds = staff.filter(st => st.is_active !== 0).map(st => st.id);
                                                setQuickStaffIds(activeIds);
                                              }}
                                            >
                                              全選択
                                            </button>
                                            <button 
                                              type="button" 
                                              className="dropdown-action-btn"
                                              onClick={() => setQuickStaffIds([])}
                                            >
                                              クリア
                                            </button>
                                          </div>
                                          <div className="dropdown-items-list">
                                            {staff.filter(st => st.is_active !== 0).map(st => {
                                              const isChecked = quickStaffIds.includes(st.id);
                                              return (
                                                <label key={st.id} className="dropdown-checkbox-item">
                                                  <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                      if (isChecked) {
                                                        setQuickStaffIds(quickStaffIds.filter(id => id !== st.id));
                                                      } else {
                                                        setQuickStaffIds([...quickStaffIds, st.id]);
                                                      }
                                                    }}
                                                  />
                                                  <span>{getShortName(st.name)}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                          <button 
                                            type="button" 
                                            className="dropdown-ok-btn"
                                            onClick={() => setShowStaffDropdown(null)}
                                          >
                                            決定
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <input
                                      type="text"
                                      className="quick-form-control quick-input-time"
                                      placeholder="時間/備考 (例: 終日, 10:00〜)"
                                      value={quickTargetTime}
                                      onChange={(e) => setQuickTargetTime(e.target.value)}
                                    />

                                    <button
                                      type="button"
                                      className="btn-quick-action btn-quick-submit"
                                      onClick={() => handleQuickAdd(day.dateStr)}
                                    >
                                      登録
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-quick-action btn-quick-cancel"
                                      onClick={() => {
                                        setActiveAddFormDate(null);
                                        setShowStaffDropdown(null);
                                      }}
                                    >
                                      キャンセル
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-quick-add-trigger"
                                    onClick={() => {
                                      setQuickWorkType(workTypes.filter(t => t.is_internal === 1)[0]?.name || '休暇');
                                      setQuickStaffIds([]);
                                      setQuickTargetTime('');
                                      setActiveAddFormDate(day.dateStr);
                                    }}
                                  >
                                    ＋ クイック追加
                                  </button>
                                )}
                              </div>
                            </th>
                          </tr>
                          {/* 2段目ヘッダー: 各項目ヘッダー */}
                          <tr>
                            <th>タイプ</th>
                            <th>BOX</th>
                            <th>号機</th>
                            <th>物件名</th>
                            <th>種別</th>
                            <th>作業内容</th>
                            <th>時間</th>
                            <th>対応者</th>
                            <th>エリア</th>
                            <th>県別</th>
                            <th>移動</th>
                            <th>同行者</th>
                            <th>依頼番号</th>
                            <th>TIME</th>
                            <th>コース</th>
                            <th>備考</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: maxRows }).map((_, rowIndex) => {
                            const schedule = daySchedules[rowIndex];
                            if (schedule) {
                              const staffMember = staff.find(st => st.id === schedule.staff_id);
                               const isCancelled = schedule.status === 'cancelled';
                               const isDraft = schedule.status === 'draft';
                               const isConfirmedVal = isConfirmed(schedule.status);
                               
                               let statusClass = 'row-cell-free';
                               if (isConfirmedVal) statusClass = 'row-cell-confirmed';
                               if (isDraft) statusClass = 'row-cell-draft';
                               if (isCancelled) statusClass = 'row-cell-cancelled';

                              return (
                                <tr 
                                  key={rowIndex} 
                                  className={`parallel-calendar-row ${selectedScheduleId === schedule.id ? 'selected-row' : ''}`}
                                  onClick={() => {
                                    setSelectedScheduleId(schedule.id);
                                    setSelectedEmptyCell(null);
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({
                                      x: e.clientX,
                                      y: e.clientY,
                                      schedule
                                    });
                                  }}
                                >
                                  {renderEditableCell(schedule, rowIndex, 'type', `${statusClass} first-status-cell ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'box', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'unit_number', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'property_name', `${statusClass} ${isToday ? 'today-td' : ''} font-bold-cell`, schedule.property_name)}
                                  {renderEditableCell(schedule, rowIndex, 'work_type', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'description', `${statusClass} ${isToday ? 'today-td' : ''} text-muted-cell`, schedule.description || '')}
                                  {renderEditableCell(schedule, rowIndex, 'target_time', `${statusClass} ${isToday ? 'today-td' : ''} time-limit-cell`, undefined, {
                                    color: schedule.target_time === '必ず' ? 'var(--danger)' : 'inherit',
                                    fontWeight: schedule.target_time === '必ず' ? 'bold' : 'normal'
                                  })}
                                  {editingCell?.id === schedule.id && editingCell?.field === 'staff_name' ? (
                                    <td className={`${statusClass} ${isToday ? 'today-td' : ''}`}>
                                      <select
                                        className="inline-edit-select"
                                        value={String(schedule.staff_id || '')}
                                        onChange={async (e) => {
                                          const nextStaffId = e.target.value ? Number(e.target.value) : null;
                                          const nextStaff = staff.find(st => st.id === nextStaffId);
                                          
                                          // 選択されたスタッフのデフォルトコースと区分を自動決定
                                          const courseVal = nextStaff ? (nextStaff.default_course || '') : '';
                                          const courseNum = Number(courseVal);
                                          let divisionVal = '未定';
                                          if (courseVal !== '' && !isNaN(courseNum)) {
                                            if (courseNum >= 1 && courseNum <= 26) {
                                              divisionVal = 'FTS';
                                            } else {
                                              divisionVal = '委託';
                                            }
                                          }

                                          setEditingCell(null);

                                          // 保存処理の呼び出し
                                          const isTemp = typeof schedule.id === 'string' && schedule.id.startsWith('temp-');
                                          if (isTemp) {
                                            const parts = String(schedule.id).split('-');
                                            const isUnassigned = String(schedule.id).startsWith('temp-unassigned-');
                                            const tempDate = isUnassigned ? parts.slice(3).join('-') : parts.slice(2).join('-');

                                            const payload: Partial<Schedule> = {
                                              status: 'confirmed',
                                              date: tempDate,
                                              staff_id: nextStaffId,
                                              staff_name: nextStaff ? nextStaff.name : '',
                                              course: courseVal,
                                              division: divisionVal,
                                              work_type: 'フリー',
                                              property_name: '（物件名未定）',
                                              is_transferred: 0
                                            };
                                            await onSave(payload);
                                          } else {
                                            const payload: Partial<Schedule> = {
                                              id: Number(schedule.id),
                                              staff_id: nextStaffId,
                                              staff_name: nextStaff ? nextStaff.name : '',
                                              course: courseVal,
                                              division: divisionVal
                                            };
                                            await onSave(payload);
                                          }
                                        }}
                                        onBlur={() => setEditingCell(null)}
                                        autoFocus
                                      >
                                        <option value="">- 未設定 -</option>
                                        {staff.filter(st => st.is_active !== 0).map(st => (
                                          <option key={st.id} value={st.id}>{getShortName(st.name)}</option>
                                        ))}
                                      </select>
                                    </td>
                                  ) : (
                                    <td 
                                      className={`${statusClass} ${isToday ? 'today-td' : ''} ${getSelectionClassName(day.dateStr, rowIndex, 'staff_name')}`}
                                      onMouseDown={(e) => handleCellMouseDown(e, day.dateStr, rowIndex, 'staff_name', schedule.id)}
                                      onMouseEnter={() => handleCellMouseEnter(day.dateStr, rowIndex, 'staff_name')}
                                      onDoubleClick={() => {
                                        setEditingCell({ id: schedule.id, field: 'staff_name' });
                                      }}
                                    >
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
                                          <span className="staff-tag-cell" style={{ borderLeft: '3px solid var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {getShortName(staffMember.name)}
                                          </span>
                                        </div>
                                      ) : (
                                        schedule.staff_name ? (
                                          <span className="staff-tag-cell" style={{ borderLeft: '3px solid #6b7280' }}>
                                            {getShortName(schedule.staff_name)}
                                          </span>
                                        ) : (
                                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>未設定</span>
                                        )
                                      )}
                                    </td>
                                  )}
                                  {renderEditableCell(schedule, rowIndex, 'area', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'prefecture', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'transport', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'co_worker', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'request_number', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'time_limit', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'course', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'notes', `${statusClass} ${isToday ? 'today-td' : ''} text-muted-cell`, schedule.notes || '')}
                                </tr>
                              );
                            } else {
                              return (
                                <tr key={rowIndex} className="parallel-calendar-row">
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                  <td className={`empty-cell ${isToday ? 'today-td' : ''}`}></td>
                                </tr>
                              );
                            }
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          );

        })}
      </div>

      {/* 簡易コンテキストメニュー */}
      {contextMenu && (
        <div 
          className="custom-context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.schedule && !isTempSchedule(contextMenu.schedule) ? (
            <>
              <button 
                type="button" 
                onClick={() => {
                  setCopiedSchedule(contextMenu.schedule!);
                  setSelectedScheduleId(contextMenu.schedule!.id);
                  setContextMenu(null);
                }}
              >
                予定をコピー
              </button>
              <button 
                type="button" 
                onClick={() => {
                  onOpenEditModal(contextMenu.schedule!);
                  setContextMenu(null);
                }}
              >
                詳細を編集 (モーダル)
              </button>
              {contextMenu.schedule.status !== 'free' && (
                <button 
                  type="button" 
                  onClick={async () => {
                    setContextMenu(null);
                    await onSave({
                      id: contextMenu.schedule!.id,
                      status: 'free'
                    });
                  }}
                >
                  予定を【フリー】に変更
                </button>
              )}
              {contextMenu.schedule.status !== 'confirmed' && (
                <button 
                  type="button" 
                  onClick={async () => {
                    setContextMenu(null);
                    await onSave({
                      id: contextMenu.schedule!.id,
                      status: 'confirmed'
                    });
                  }}
                >
                  予定を【確定】に変更
                </button>
              )}
              {contextMenu.schedule.status !== 'draft' && (
                <button 
                  type="button" 
                  onClick={async () => {
                    setContextMenu(null);
                    await onSave({
                      id: contextMenu.schedule!.id,
                      status: 'draft'
                    });
                  }}
                >
                  予定を【仮】に変更
                </button>
              )}
              {contextMenu.schedule.status !== 'cancelled' && (
                <button 
                  type="button" 
                  onClick={async () => {
                    setContextMenu(null);
                    await onSave({
                      id: contextMenu.schedule!.id,
                      status: 'cancelled',
                      division: '未定',
                      staff_id: null,
                      staff_name: '',
                      course: ''
                    });
                  }}
                  className="delete-menu-item"
                  style={{ color: '#f87171' }}
                >
                  予定を【キャンセル】に変更
                </button>
              )}
              <button 
                type="button" 
                className="delete-menu-item"
                onClick={() => {
                  if (window.confirm('この予定を削除しますか？')) {
                    if (typeof contextMenu.schedule!.id === 'number') {
                      onDelete(contextMenu.schedule!.id);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                予定を削除
              </button>
            </>
          ) : (
            copiedSchedule && (
              <button 
                type="button" 
                onClick={() => {
                  let tDate = contextMenu.dateStr;
                  let tStaffId = contextMenu.staffId;
                  
                  if (contextMenu.schedule && isTempSchedule(contextMenu.schedule)) {
                    const parts = String(contextMenu.schedule.id).split('-');
                    const tempStaffName = parts[1];
                    tDate = parts.slice(2).join('-');
                    const matchedStaff = staff.find(st => st.name === tempStaffName);
                    if (matchedStaff) {
                      tStaffId = matchedStaff.id;
                    }
                  }
                  
                  if (tDate && tStaffId) {
                    handlePaste(tDate, tStaffId);
                  }
                  setContextMenu(null);
                }}
              >
                コピーした予定を貼り付け
              </button>
            )
          )}
        </div>
      )}

      {/* コピー中インジケーターバー */}
      {copiedSchedule && (
        <div className="copy-indicator-bar">
          <span className="copy-indicator-text">
            コピー中: <strong>{copiedSchedule.property_name || '名称未設定'}</strong> ({copiedSchedule.work_type})
          </span>
          <button 
            type="button" 
            className="btn btn-secondary btn-xs" 
            onClick={() => setCopiedSchedule(null)}
          >
            解除
          </button>
        </div>
      )}
    </div>
  );
};

function isConfirmed(status: string) {
  return status === 'confirmed';
}
