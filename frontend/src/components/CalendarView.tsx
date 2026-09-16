import React, { useState, useRef } from 'react';
import type { Schedule, Staff, WorkType, UserRole } from '../types';
import { getShortName, findStaffByName, toHalfWidth, normalizeTargetTime, splitCoWorkers, compareSchedules } from '../types';
import { buildFcAutofillPatch } from '../utils/fcAutofill';

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Plus, Search, Lock, Eye, EyeOff } from 'lucide-react';
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
      if (s.staff_name) {
        const shortName = getShortName(s.staff_name);
        if (shortName && !groups[groupKey].staff_names.includes(shortName)) {
          groups[groupKey].staff_names.push(shortName);
        }
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

// TSVコピー時にセル内改行・タブ・ダブルクォートを適切にエスケープするヘルパー
const formatTsvCell = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// インライン直接入力用の軽量コンポーネント (キー入力による親全体の再レンダリングを防止)
interface InlineInputProps {
  initialValue: string;
  field: keyof Schedule;
  workTypes: WorkType[];
  onSave: (val: string) => void;
  onCancel: () => void;
}

const InlineInput: React.FC<InlineInputProps> = ({
  initialValue,
  field,
  workTypes,
  onSave,
  onCancel
}) => {
  const [value, setValue] = React.useState(initialValue);

  if (field === 'work_type') {
    return (
      <select
        className="inline-edit-select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
        autoFocus
      >
        {workTypes.map(t => (
          <option key={t.id} value={t.name}>{t.name}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      className="inline-edit-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSave(value);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      autoFocus
    />
  );
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
  currentUserRole?: UserRole;
  currentUserName?: string;
  activeLocks?: Record<number, { userEmail: string; userName: string; startedAt: number }>;
  zoomLevel?: number;
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
  activeLocks = {},
  zoomLevel = 100,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateInputRef = useRef<HTMLInputElement>(null);

  // 全文表示モード状態管理（物件名・作業内容・備考などのテキストを折り返して全表示）
  const [showFullText, setShowFullText] = useState<boolean>(() => {
    return localStorage.getItem('field_app_calendar_full_text') === 'true';
  });

  React.useEffect(() => {
    localStorage.setItem('field_app_calendar_full_text', String(showFullText));
  }, [showFullText]);

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
  const [quickCustomWorkType, setQuickCustomWorkType] = useState('');
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
  const [selectedCell, setSelectedCell] = useState<{ id: number | string; field: keyof Schedule } | null>(null);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | string | null>(null);
  const [selectedEmptyCell, setSelectedEmptyCell] = useState<{ date: string; staffId: number } | null>(null);
  const [copiedSchedule, setCopiedSchedule] = useState<Schedule | null>(null);

  // === 複数行選択用のステート ===
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<number[]>([]);
  const lastSelectedScheduleIdRef = useRef<number | null>(null);

  // === 別日へ移動モーダル用のステート ===
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetMoveScheduleIds, setTargetMoveScheduleIds] = useState<number[]>([]);
  const [destinationDate, setDestinationDate] = useState('');
  const [keepAsCancelled, setKeepAsCancelled] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  // === 検索用のステートとRef ===
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Googleスプレッドシート完全同等: Selection Overlay アーキテクチャ (CalendarView)（遅延0ms・React再レンダリング0回）
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarSelectionOverlayRef = useRef<HTMLDivElement | null>(null);
  const calendarCopyOverlayRef = useRef<HTMLDivElement | null>(null);

  const calendarSelectionRangeRef = useRef<{
    startDateStr: string;
    startRow: number;
    startField: keyof Schedule;
    endDateStr: string;
    endRow: number;
    endField: keyof Schedule;
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
  } | null>(null);

  const calendarCopiedRangeRef = useRef<{
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  } | null>(null);

  const isSelectingRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const selectionStartCoordRef = useRef<CellCoordinate | null>(null);

  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<any>(null);

  // ペースト後の Undo（元に戻す）管理
  const [pasteToast, setPasteToast] = useState<{
    message: string;
  } | null>(null);
  const pasteToastTimerRef = useRef<any>(null);
  const lastPasteBackupRef = useRef<{
    overwrittenSchedules: Schedule[];
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    schedule?: Schedule;
    dateStr?: string;
    staffId?: number;
    selectedIds?: number[];
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

  const dateIndexMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    calendarDates.forEach((d, idx) => { map[d] = idx; });
    return map;
  }, [calendarDates]);

  const fieldIndexMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    FIELD_ORDER.forEach((f, idx) => { map[f] = idx; });
    return map;
  }, []);

  const getColAbsoluteIndex = React.useCallback((dateStr: string, field: keyof Schedule) => {
    const dateIdx = dateIndexMap[dateStr] ?? -1;
    const fieldIdx = fieldIndexMap[field] ?? -1;
    if (dateIdx === -1 || fieldIdx === -1) return -1;
    return dateIdx * FIELD_ORDER.length + fieldIdx;
  }, [dateIndexMap, fieldIndexMap]);

  const getCoordByAbsoluteCol = React.useCallback((absCol: number): { dateStr: string; field: keyof Schedule } | null => {
    if (absCol < 0) return null;
    const numFields = FIELD_ORDER.length;
    const dateIdx = Math.floor(absCol / numFields);
    const fieldIdx = absCol % numFields;
    if (dateIdx < 0 || dateIdx >= calendarDates.length) return null;
    const dateStr = calendarDates[dateIdx];
    const field = FIELD_ORDER[fieldIdx];
    if (!dateStr || !field) return null;
    return { dateStr, field };
  }, [calendarDates]);

  // 各日付ごとのソート・仮想行適用済みのスケジュールリストをキャッシュして再レンダリング時のもっさり感を完全に解消
  const sortedSchedulesMap = React.useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    
    // 共通で利用するマスタ関連データをループ外で1回だけ評価
    const internalWorkTypes = workTypes
      .filter(t => t.is_internal === 1 && t.name !== '休暇')
      .map(t => t.name);

    const activeStaffs = staff.filter(st => st.default_course && st.is_active !== 0);

    calendarDates.forEach(targetDate => {
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

      const displaySchedules = actualSchedules.filter(s => {
        const isHolidayType = s.work_type === '休暇';
        const isInternalType = s.work_type && internalWorkTypes.includes(s.work_type);
        
        if (isHolidayType || isInternalType) return false;
        if (s.staff_id && holidayStaffIds.has(s.staff_id)) return false;
        if (s.staff_name && holidayStaffNames.has(s.staff_name.trim())) return false;
        
        // 同行でコース番号が振られていない人は別途の行追加は不要（除外）
        const isCoWorkerChild = s.notes && s.notes.includes('[__parent_id:');
        if (isCoWorkerChild) {
          const courseStr = String(s.course || '').trim();
          if (!courseStr) return false;
        }

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

        // 同日の他の予定に同行者として名前が入っているかを判定
        const isCoWorkerOnThisDay = displaySchedules.some(s => {
          if (s.status === 'cancelled' || !s.co_worker) return false;
          const coWorkerNames = splitCoWorkers(s.co_worker, staff);
          return coWorkerNames.some(cwName => {
            const matched = findStaffByName(staff, cwName);
            return matched && matched.id === stItem.id;
          });
        });

        if (!hasScheduleForThisCourse && !isCoWorkerOnThisDay) {
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
          work_type: '',
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

      blended.sort(compareSchedules);

      map[targetDate] = blended;
    });

    return map;
  }, [schedules, staff, workTypes, calendarDates]);

  // 薄いラッパー関数へ変更してキャッシュを参照
  const getSortedDaySchedules = (targetDate: string): Schedule[] => {
    return sortedSchedulesMap[targetDate] || [];
  };

  // Googleスプレッドシート完全同等: Selection Overlay 制御関数群 (CalendarView)
  const updateCalendarSelectionOverlayDom = (
    startDateStr: string,
    startRowIndex: number,
    startField: keyof Schedule,
    endDateStr: string,
    endRowIndex: number,
    endField: keyof Schedule
  ) => {
    if (!calendarContainerRef.current || !calendarSelectionOverlayRef.current) return;
    const container = calendarContainerRef.current;
    const overlay = calendarSelectionOverlayRef.current;

    const startTd = document.getElementById(`cell-${startDateStr}-${startRowIndex}-${startField}`);
    const endTd = document.getElementById(`cell-${endDateStr}-${endRowIndex}-${endField}`);

    if (!startTd || !endTd) {
      overlay.style.display = 'none';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const startRect = startTd.getBoundingClientRect();
    const endRect = endTd.getBoundingClientRect();

    const left = Math.min(startRect.left, endRect.left) - containerRect.left;
    const top = Math.min(startRect.top, endRect.top) - containerRect.top;
    const right = Math.max(startRect.right, endRect.right) - containerRect.left;
    const bottom = Math.max(startRect.bottom, endRect.bottom) - containerRect.top;

    const width = right - left;
    const height = bottom - top;

    overlay.style.display = 'block';
    overlay.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;

    const isMultiCell = startDateStr !== endDateStr || startRowIndex !== endRowIndex || startField !== endField;
    if (isMultiCell) {
      overlay.classList.add('is-multi-cell');
    } else {
      overlay.classList.remove('is-multi-cell');
    }

    const startCol = getColAbsoluteIndex(startDateStr, startField);
    const endCol = getColAbsoluteIndex(endDateStr, endField);

    calendarSelectionRangeRef.current = {
      startDateStr,
      startRow: startRowIndex,
      startField,
      endDateStr,
      endRow: endRowIndex,
      endField,
      minRow: Math.min(startRowIndex, endRowIndex),
      maxRow: Math.max(startRowIndex, endRowIndex),
      minCol: Math.min(startCol, endCol),
      maxCol: Math.max(startCol, endCol),
    };
  };

  const updateCalendarCopyOverlayDom = () => {
    if (!calendarContainerRef.current || !calendarCopyOverlayRef.current) return;
    const container = calendarContainerRef.current;
    const overlay = calendarCopyOverlayRef.current;

    if (!calendarCopiedRangeRef.current) {
      overlay.style.display = 'none';
      return;
    }

    const { minCol, maxCol, minRow, maxRow } = calendarCopiedRangeRef.current;
    const startCoord = getCoordByAbsoluteCol(minCol);
    const endCoord = getCoordByAbsoluteCol(maxCol);

    if (!startCoord || !endCoord) {
      overlay.style.display = 'none';
      return;
    }

    const startTd = document.getElementById(`cell-${startCoord.dateStr}-${minRow}-${startCoord.field}`);
    const endTd = document.getElementById(`cell-${endCoord.dateStr}-${maxRow}-${endCoord.field}`);

    if (!startTd || !endTd) {
      overlay.style.display = 'none';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const startRect = startTd.getBoundingClientRect();
    const endRect = endTd.getBoundingClientRect();

    const left = Math.min(startRect.left, endRect.left) - containerRect.left;
    const top = Math.min(startRect.top, endRect.top) - containerRect.top;
    const right = Math.max(startRect.right, endRect.right) - containerRect.left;
    const bottom = Math.max(startRect.bottom, endRect.bottom) - containerRect.top;

    overlay.style.display = 'block';
    overlay.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    overlay.style.width = `${right - left}px`;
    overlay.style.height = `${bottom - top}px`;
  };

  const clearCalendarSelectionOverlay = () => {
    if (calendarSelectionOverlayRef.current) {
      calendarSelectionOverlayRef.current.style.display = 'none';
    }
    calendarSelectionRangeRef.current = null;
  };

  // セル描画の超軽量化: クラス計算を全廃し、テーブル再描画コストを完全ゼロ化
  const getSelectionClassName = (_dateStr: string, _rowIndex: number, _field: keyof Schedule) => '';
  const isBottomRightSelectedCell = (_dateStrOrCol: string | number, _rowIndex: number, _field?: keyof Schedule) => false;

  const handleCellMouseDown = (
    e: React.MouseEvent,
    dateStr: string,
    rowIndex: number,
    field: keyof Schedule,
    scheduleId: number | string
  ) => {
    if (e.button !== 0) return; // 左クリックのみ
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || (e.target as HTMLElement).closest('button')) {
      return;
    }
    e.stopPropagation(); // tr 行選択イベントへの伝播を完全に防止

    isSelectingRef.current = true;
    isDraggingRef.current = false;
    selectionStartCoordRef.current = { dateStr, rowIndex, field };

    // ★遅延0ms・React再レンダリング0回でオーバーレイを瞬間移動！
    updateCalendarSelectionOverlayDom(dateStr, rowIndex, field, dateStr, rowIndex, field);

    setSelectedCell({ id: scheduleId, field });
    if (selectedScheduleIds.length > 0) {
      setSelectedScheduleIds([]);
    }
  };

  // ドラッグ中はReactの再レンダリングを完全バイパスし、直接オーバーレイを更新！
  const handleCellMouseEnter = (dateStr: string, rowIndex: number, field: keyof Schedule) => {
    if (!isSelectingRef.current || !selectionStartCoordRef.current) return;
    
    // 起点セルと同じセルにマウスが入っただけならスキップ
    if (
      selectionStartCoordRef.current.dateStr === dateStr &&
      selectionStartCoordRef.current.rowIndex === rowIndex &&
      selectionStartCoordRef.current.field === field
    ) {
      return;
    }

    isDraggingRef.current = true;
    updateCalendarSelectionOverlayDom(
      selectionStartCoordRef.current.dateStr,
      selectionStartCoordRef.current.rowIndex,
      selectionStartCoordRef.current.field,
      dateStr,
      rowIndex,
      field
    );
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

  // 貼り付け直前の状態に復元する Undo 処理
  const handleUndoPaste = React.useCallback(async () => {
    if (!lastPasteBackupRef.current) return;
    const backup = lastPasteBackupRef.current;
    lastPasteBackupRef.current = null;
    setPasteToast(null);

    try {
      const promises: Promise<void>[] = [];
      for (const orig of backup.overwrittenSchedules) {
        promises.push(onSave(orig));
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      setCopyToast('↩️ 貼り付け前の状態に戻しました');
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2500);
    } catch (err) {
      console.error('Failed to undo paste:', err);
      alert('元に戻す処理に失敗しました。');
    }
  }, [onSave]);

  // 行選択ハンドラ（通常クリック、Ctrl+クリック、Shift+クリック）
  const handleSelectRow = (e: React.MouseEvent, schedule: Schedule) => {
    if (typeof schedule.id !== 'number') {
      setSelectedScheduleId(schedule.id);
      setSelectedScheduleIds([]);
      lastSelectedScheduleIdRef.current = null;
      return;
    }

    const clickedId = schedule.id;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl + クリック: 個別トグル追加/解除
      setSelectedScheduleIds(prev => {
        const exists = prev.includes(clickedId);
        const next = exists ? prev.filter(id => id !== clickedId) : [...prev, clickedId];
        setSelectedScheduleId(next.length > 0 ? next[next.length - 1] : null);
        lastSelectedScheduleIdRef.current = clickedId;
        return next;
      });
    } else if (e.shiftKey && lastSelectedScheduleIdRef.current !== null) {
      // Shift + クリック: 範囲選択（同じ日付のカレンダー内）
      const daySchedules = (sortedSchedulesMap[schedule.date] || []).filter(s => typeof s.id === 'number');
      const lastIdx = daySchedules.findIndex(s => s.id === lastSelectedScheduleIdRef.current);
      const currIdx = daySchedules.findIndex(s => s.id === clickedId);

      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeIds = daySchedules.slice(start, end + 1).map(s => Number(s.id));
        setSelectedScheduleIds(prev => {
          const combined = new Set([...prev, ...rangeIds]);
          return Array.from(combined);
        });
        setSelectedScheduleId(clickedId);
      } else {
        setSelectedScheduleIds([clickedId]);
        setSelectedScheduleId(clickedId);
        lastSelectedScheduleIdRef.current = clickedId;
      }
    } else {
      // 通常クリック: 単一選択（行選択状態の更新のみ行い、サイドバーは勝手に開かない）
      setSelectedScheduleIds([clickedId]);
      setSelectedScheduleId(clickedId);
      lastSelectedScheduleIdRef.current = clickedId;
    }
  };

  // 一括ステータス変更処理
  const handleBulkStatusChange = async (targetStatus: 'confirmed' | 'draft' | 'cancelled' | 'free', idsToUpdate?: number[]) => {
    const ids = idsToUpdate || selectedScheduleIds;
    if (ids.length === 0) return;

    setIsBulkOperating(true);
    try {
      for (const id of ids) {
        const sched = schedules.find(s => s.id === id);
        if (!sched) continue;

        if (targetStatus === 'cancelled') {
          await onSave({
            id,
            status: 'cancelled',
            division: '未定',
            staff_id: null,
            staff_name: '',
            course: ''
          });
        } else {
          await onSave({
            id,
            status: targetStatus
          });
        }
      }
      setSelectedScheduleIds([]);
      setSelectedScheduleId(null);
    } catch (err) {
      console.error('一括ステータス変更エラー:', err);
      alert('一括更新に失敗しました。');
    } finally {
      setIsBulkOperating(false);
    }
  };

  // 一括削除処理
  const handleBulkDelete = async (idsToDelete?: number[]) => {
    const ids = idsToDelete || selectedScheduleIds;
    if (ids.length === 0) return;

    if (!window.confirm(`選択した ${ids.length} 件の予定を削除してもよろしいですか？`)) {
      return;
    }

    setIsBulkOperating(true);
    try {
      for (const id of ids) {
        await onDelete(id);
      }
      setSelectedScheduleIds([]);
      setSelectedScheduleId(null);
    } catch (err) {
      console.error('一括削除エラー:', err);
      alert('一括削除に失敗しました。');
    } finally {
      setIsBulkOperating(false);
    }
  };

  // 別日へ移動モーダルを開く
  const handleOpenMoveModal = (ids?: number[]) => {
    const targetIds = ids && ids.length > 0 ? ids : selectedScheduleIds;
    if (targetIds.length === 0) return;

    const firstSched = schedules.find(s => targetIds.includes(Number(s.id)));
    let initialDate = '';
    if (firstSched && firstSched.date) {
      const d = new Date(firstSched.date);
      d.setDate(d.getDate() + 1);
      initialDate = getLocalDateString(d);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      initialDate = getLocalDateString(tomorrow);
    }

    setTargetMoveScheduleIds(targetIds);
    setDestinationDate(initialDate);
    setKeepAsCancelled(true);
    setIsMoveModalOpen(true);
  };

  // 別日へ移動の実行処理
  const handleExecuteMove = async () => {
    if (!destinationDate) {
      alert('移動先の日付を選択してください。');
      return;
    }
    if (targetMoveScheduleIds.length === 0) return;

    setIsMoving(true);
    try {
      const targetSchedules = schedules.filter(s => targetMoveScheduleIds.includes(Number(s.id)));
      
      const [destY, destM, destD] = destinationDate.split('-').map(Number);
      
      for (const sched of targetSchedules) {
        if (keepAsCancelled) {
          // 移動先の日付表記 (例: 9/15へ移動、年が異なる場合は 2027/1/15へ移動)
          const schedY = sched.date ? Number(sched.date.split('-')[0]) : destY;
          const formattedDestDate = destY !== schedY
            ? `${destY}/${destM}/${destD}へ移動`
            : `${destM}/${destD}へ移動`;

          const originalNotes = (sched.notes || '').trim();
          // 既存の「〇/〇へ移動」表記を除去してクリーンな備考を抽出
          const cleanNotes = originalNotes
            .replace(/^(\d{4}\/)?\d{1,2}\/\d{1,2}へ移動(?:\s*\/\s*|\s+)?/, '')
            .trim();

          const updatedCancelledNotes = cleanNotes
            ? `${formattedDestDate} / ${cleanNotes}`
            : formattedDestDate;

          // 1. 元の予定をキャンセルとして更新（備考に移動先を明記）
          await onSave({
            id: sched.id,
            status: 'cancelled',
            division: '未定',
            staff_id: null,
            staff_name: '',
            course: '',
            notes: updatedCancelledNotes
          });

          // 2. 新しい日付に同じ内容で新規作成（備考は元の内容を引き継ぎ）
          await onSave({
            status: 'free',
            date: destinationDate,
            property_name: sched.property_name,
            unit_number: sched.unit_number,
            type: sched.type,
            box: sched.box,
            work_type: sched.work_type,
            description: sched.description,
            target_time: sched.target_time,
            staff_id: sched.staff_id,
            staff_name: sched.staff_name,
            area: sched.area,
            prefecture: sched.prefecture,
            transport: sched.transport,
            co_worker: sched.co_worker,
            request_number: sched.request_number,
            course: sched.course,
            division: sched.division,
            notes: cleanNotes || null,
            disorder_type: sched.disorder_type,
            level: sched.level,
            level_3: sched.level_3,
            is_transferred: 0
          });
        } else {
          // 日付のみを直接スライド移動
          await onSave({
            id: sched.id,
            date: destinationDate
          });
        }
      }

      setIsMoveModalOpen(false);
      setSelectedScheduleIds([]);
      setSelectedScheduleId(null);
    } catch (err) {
      console.error('別日へ移動エラー:', err);
      alert('別日への移動処理に失敗しました。');
    } finally {
      setIsMoving(false);
    }
  };

  // インライン直接編集保存処理
  const handleInlineSave = async (scheduleId: number | string, field: keyof Schedule, value: string) => {
    setEditingCell(null);
    const isTemp = typeof scheduleId === 'string' && scheduleId.startsWith('temp-');
    
    if (isTemp) {
      if (!value || value.trim() === '') {
        return;
      }
      const parts = String(scheduleId).split('-');
      const isUnassigned = String(scheduleId).startsWith('temp-unassigned-');
      const tempStaffName = isUnassigned ? '' : parts[1];
      const tempDate = isUnassigned ? parts.slice(3).join('-') : parts.slice(2).join('-');
      const matchedStaff = tempStaffName ? findStaffByName(staff, tempStaffName) : undefined;

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
        [field]: field === 'target_time' ? normalizeTargetTime(value) : (field === 'time_limit' ? toHalfWidth(value) : value)
      };

      // 依頼番号セルへの入力は FC 同期データから未入力項目を補完する
      if (field === 'request_number') {
        const patch = await buildFcAutofillPatch(value, payload);
        if (patch) Object.assign(payload, patch);
      }

      try {
        await onSave(payload);
      } catch (err) {
        console.error('Failed to create schedule via inline edit:', err);
        alert('登録に失敗しました。');
      }
    } else {
      let finalValue = value;
      const extraFields: Partial<Schedule> = {};

      if (field === 'target_time') {
        finalValue = normalizeTargetTime(value);
      } else if (field === 'time_limit') {
        finalValue = toHalfWidth(value);
      }

      if (field === 'staff_name') {
        const trimmedName = value.trim();
        if (trimmedName !== '') {
          const matchedStaff = findStaffByName(staff, trimmedName);
          if (matchedStaff) {
            extraFields.staff_id = matchedStaff.id;
            finalValue = matchedStaff.name; // マスタの正式名称に上書き
            extraFields.course = matchedStaff.default_course || '';
            const cNum = Number(extraFields.course);
            if (extraFields.course !== '' && !isNaN(cNum)) {
              extraFields.division = (cNum >= 1 && cNum <= 26) ? 'FTS' : '委託';
            }
          } else {
            extraFields.staff_id = null;
            finalValue = trimmedName;
            extraFields.course = '';
            extraFields.division = '未定';
          }
        } else {
          extraFields.staff_id = null;
          finalValue = '';
          extraFields.course = '';
          extraFields.division = '未定';
        }
      }

      if (field === 'course') {
        const cNum = Number(value);
        if (value !== '' && !isNaN(cNum)) {
          extraFields.division = (cNum >= 1 && cNum <= 26) ? 'FTS' : '委託';
        } else {
          extraFields.division = '未定';
        }
      }

      if (field === 'notes') {
        const original = schedules.find(s => s.id === scheduleId);
        if (original && original.notes) {
          const matchParent = original.notes.match(/\[__parent_id:\d+__\]/);
          const matchNoSync = original.notes.includes('[__no_sync__]');
          let suffixes = '';
          if (matchParent) {
            suffixes += `\n\n${matchParent[0]}`;
          }
          if (matchNoSync) {
            suffixes += `\n\n[__no_sync__]`;
          }
          finalValue = `${value.trim()}${suffixes}`;
        }
      }

      const payload: Partial<Schedule> = {
        id: Number(scheduleId),
        [field]: finalValue,
        ...extraFields
      };

      // 依頼番号セルへの入力は FC 同期データから未入力項目を補完する
      if (field === 'request_number') {
        const original = schedules.find(s => s.id === Number(scheduleId));
        const patch = await buildFcAutofillPatch(finalValue, original || {});
        if (patch) Object.assign(payload, patch);
      }

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
      isSelectingRef.current = false;
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', handleMouseUpGlobal);
    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, []);

  React.useEffect(() => {
    const handleResize = () => {
      if (calendarSelectionRangeRef.current) {
        const { startDateStr, startRow, startField, endDateStr, endRow, endField } = calendarSelectionRangeRef.current;
        updateCalendarSelectionOverlayDom(startDateStr, startRow, startField, endDateStr, endRow, endField);
      }
      if (calendarCopiedRangeRef.current) {
        updateCalendarCopyOverlayDom();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // キーボードショートカットおよびクリップボード貼り付けの監視
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 検索窓フォーカス中は、Enter/Esc/矢印移動のショートカットを通常通り動作させるか、それとも無視するか
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape' && e.target === searchInputRef.current) {
          searchInputRef.current.blur();
        }
        return;
      }

      if (editingCell) {
        return;
      }

      // スプレッドシート完全準拠: Escapeキーでコピー破線マーキー枠および選択枠を解除
      if (e.key === 'Escape') {
        if (calendarCopiedRangeRef.current || copiedSchedule) {
          calendarCopiedRangeRef.current = null;
          setCopiedSchedule(null);
          if (calendarCopyOverlayRef.current) {
            calendarCopyOverlayRef.current.style.display = 'none';
          }
          e.preventDefault();
          return;
        } else {
          clearCalendarSelectionOverlay();
          setSelectedCell(null);
          setSelectedScheduleId(null);
          setSelectedScheduleIds([]);
        }
      }

      // Ctrl + F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        return;
      }

      // Ctrl + Z (元に戻す)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (lastPasteBackupRef.current) {
          e.preventDefault();
          handleUndoPaste();
          return;
        }
      }

      // 矢印キー移動（0.001ms・React再レンダリング0回）
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!calendarSelectionRangeRef.current) {
          // 選択セルがない場合、最初のセルを選択
          const firstDate = calendarDates[0];
          if (firstDate) {
            const daySchedules = getSortedDaySchedules(firstDate);
            if (daySchedules.length > 0) {
              const firstSched = daySchedules[0];
              setSelectedCell({ id: firstSched.id, field: FIELD_ORDER[0] });
              setSelectedScheduleId(firstSched.id);
              updateCalendarSelectionOverlayDom(firstDate, 0, FIELD_ORDER[0], firstDate, 0, FIELD_ORDER[0]);
            }
          }
          return;
        }

        e.preventDefault();

        const curDateStr = calendarSelectionRangeRef.current.startDateStr;
        const curRowIndex = calendarSelectionRangeRef.current.startRow;
        const curField = calendarSelectionRangeRef.current.startField;

        const dateIdx = calendarDates.indexOf(curDateStr);
        const fieldIdx = FIELD_ORDER.indexOf(curField);

        let nextDateStr = curDateStr;
        let nextRowIndex = curRowIndex;
        let nextFieldIdx = fieldIdx;

        if (e.key === 'ArrowUp') {
          if (curRowIndex > 0) {
            nextRowIndex = curRowIndex - 1;
          }
        } else if (e.key === 'ArrowDown') {
          const daySchedules = getSortedDaySchedules(curDateStr);
          if (curRowIndex < daySchedules.length - 1) {
            nextRowIndex = curRowIndex + 1;
          }
        } else if (e.key === 'ArrowLeft') {
          if (fieldIdx > 0) {
            nextFieldIdx = fieldIdx - 1;
          } else if (dateIdx > 0) {
            nextDateStr = calendarDates[dateIdx - 1];
            nextFieldIdx = FIELD_ORDER.length - 1;
            const prevDaySchedules = getSortedDaySchedules(nextDateStr);
            if (nextRowIndex >= prevDaySchedules.length) {
              nextRowIndex = Math.max(0, prevDaySchedules.length - 1);
            }
          }
        } else if (e.key === 'ArrowRight') {
          if (fieldIdx < FIELD_ORDER.length - 1) {
            nextFieldIdx = fieldIdx + 1;
          } else if (dateIdx < calendarDates.length - 1) {
            nextDateStr = calendarDates[dateIdx + 1];
            nextFieldIdx = 0;
            const nextDaySchedules = getSortedDaySchedules(nextDateStr);
            if (nextRowIndex >= nextDaySchedules.length) {
              nextRowIndex = Math.max(0, nextDaySchedules.length - 1);
            }
          }
        }

        if (nextDateStr === curDateStr && nextRowIndex === curRowIndex && nextFieldIdx === fieldIdx) {
          return;
        }

        const nextField = FIELD_ORDER[nextFieldIdx];
        const daySchedules = getSortedDaySchedules(nextDateStr);
        const sched = daySchedules[nextRowIndex];
        if (sched) {
          setSelectedCell({ id: sched.id, field: nextField });
          setSelectedScheduleId(sched.id);
          updateCalendarSelectionOverlayDom(nextDateStr, nextRowIndex, nextField, nextDateStr, nextRowIndex, nextField);

          // 自動スクロール処理（即時追従 behavior: 'auto' でキー連打時も遅延ゼロで動作）
          const cellId = `cell-${nextDateStr}-${nextRowIndex}-${nextField}`;
          const cellElem = document.getElementById(cellId);
          if (cellElem) {
            cellElem.scrollIntoView({
              behavior: 'auto',
              block: 'nearest',
              inline: 'nearest'
            });
          }
        }
        return;
      }

      // Enterキーでの編集開始
      if (e.key === 'Enter') {
        if (selectedCell && calendarSelectionRangeRef.current) {
          const daySchedules = getSortedDaySchedules(calendarSelectionRangeRef.current.startDateStr);
          const sched = daySchedules[calendarSelectionRangeRef.current.startRow];
          if (sched && !isTempSchedule(sched)) {
            e.preventDefault();
            setEditingCell({ id: selectedCell.id, field: selectedCell.field });
          }
        }
        return;
      }

      // Ctrl + C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (calendarSelectionRangeRef.current) {
          const { minCol, maxCol, minRow, maxRow, startDateStr, endDateStr, startRow } = calendarSelectionRangeRef.current;

          const isSingleDay = startDateStr === endDateStr;
          const colDiff = maxCol - minCol;
          const isEntireRowSelected = isSingleDay && minRow === maxRow && colDiff === (FIELD_ORDER.length - 1) && (minCol % FIELD_ORDER.length === 0);

          if (isEntireRowSelected) {
            // 1行全体が選択されている場合：予定全体の複製モード
            const daySchedules = getSortedDaySchedules(startDateStr);
            const sched = daySchedules[startRow];
            if (sched && !isTempSchedule(sched)) {
              setCopiedSchedule(sched);
              calendarCopiedRangeRef.current = {
                minCol,
                maxCol,
                minRow,
                maxRow
              };
              updateCalendarCopyOverlayDom();

              setCopyToast('📋 予定全体をコピーしました');
              if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
              copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);

              const rowText = FIELD_ORDER.map(field => formatTsvCell(sched[field])).join('\t');
              navigator.clipboard.writeText(rowText).catch(err => {
                console.error('Failed to write to clipboard:', err);
              });
              e.preventDefault();
              return;
            }
          }

          // 一部セルのコピー（行全体のコピーは解除）
          setCopiedSchedule(null);
          calendarCopiedRangeRef.current = {
            minCol,
            maxCol,
            minRow,
            maxRow
          };
          updateCalendarCopyOverlayDom();

          const rCount = maxRow - minRow + 1;
          const cCount = maxCol - minCol + 1;
          const countDesc = (rCount > 1 || cCount > 1) ? ` (${rCount}行×${cCount}列)` : '';
          setCopyToast(`📋 クリップボードにコピーしました${countDesc}`);
          if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
          copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);

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

              const val = sched ? formatTsvCell(sched[field]) : '';
              rowText += (rowText ? '\t' : '') + val;
            }
            clipboardText += (clipboardText ? '\n' : '') + rowText;
          }

          navigator.clipboard.writeText(clipboardText).catch(err => {
            console.error('Failed to write to clipboard:', err);
          });
          e.preventDefault();
          return;
        } else if (selectedScheduleIds.length > 0 || selectedScheduleId) {
          // ★行クリック選択からの Ctrl+C コピー対応:
          // セル範囲選択がない場合でも、行選択されていればその予定全体を行データ（横1行TSV）としてコピーする
          const targetIds = selectedScheduleIds.length > 0
            ? selectedScheduleIds
            : (typeof selectedScheduleId === 'number' ? [selectedScheduleId] : []);

          let targetSchedules: Schedule[] = [];
          if (targetIds.length > 0) {
            targetSchedules = targetIds
              .map(id => schedules.find(s => s.id === id))
              .filter((s): s is Schedule => !!s && !isTempSchedule(s));
          } else if (typeof selectedScheduleId === 'string') {
            for (const d of calendarDates) {
              const daySchedules = getSortedDaySchedules(d);
              const found = daySchedules.find(s => s.id === selectedScheduleId);
              if (found) {
                targetSchedules = [found];
                break;
              }
            }
          }

          if (targetSchedules.length > 0) {
            const lines = targetSchedules.map(sched => {
              return FIELD_ORDER.map(field => formatTsvCell(sched[field])).join('\t');
            });
            const tsvText = lines.join('\n');

            navigator.clipboard.writeText(tsvText).catch(err => {
              console.error('Failed to write to clipboard:', err);
            });

            if (targetSchedules.length === 1) {
              setCopiedSchedule(targetSchedules[0]);
              setCopyToast('📋 予定全体をコピーしました');
            } else {
              setCopiedSchedule(null);
              setCopyToast(`📋 ${targetSchedules.length}件の予定をコピーしました`);
            }
            if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
            copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);

            e.preventDefault();
            return;
          }
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

        let startCoord: { dateStr: string; rowIndex: number; field: keyof Schedule } | null = null;
        if (calendarSelectionRangeRef.current) {
          startCoord = {
            dateStr: calendarSelectionRangeRef.current.startDateStr,
            rowIndex: calendarSelectionRangeRef.current.startRow,
            field: calendarSelectionRangeRef.current.startField
          };
        } else if (selectedCell) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedCell.id);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: selectedCell.field };
              break;
            }
          }
        } else if (selectedScheduleId) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedScheduleId);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: 'type' };
              break;
            }
          }
        }

        if (!startCoord) {
          alert('貼り付け先（セル）を選択してから貼り付けてください。');
          return;
        }

        let parsedRows = parseTSV(text);
        if (parsedRows.length === 0) return;

        // ★縦並びデータのスマート救済（横展開ガード）:
        // もしクリップボードの内容が「1列 × 10〜20行」の縦並びデータであり、
        // かつ各行に1つのセルしか入っていない場合：
        // （ブラウザの標準コピーや改行区切りで行コピーが縦になってしまったケース）
        // これを横1行の予定データ（1行 × N列）として自動変換して救済する！
        if (parsedRows.length >= 10 && parsedRows.length <= 20 && parsedRows.every(r => r.length === 1)) {
          const horizontalCols = parsedRows.map(r => r[0]);
          parsedRows = [horizontalCols];
        }

        // ★列ズレ根絶ガード（スマート整列）:
        // 貼り付けデータが1行全体（10列以上の予定データ）の場合、
        // 選択されたセルが途中（BOXや物件名など）であっても、必ずその行の先頭列（type）を起点として貼り付ける
        const maxColsInPaste = Math.max(...parsedRows.map(r => r.length));
        const isFullRowPaste = maxColsInPaste >= 10;
        const effectiveStartField = isFullRowPaste ? 'type' : startCoord.field;

        const startColAbs = getColAbsoluteIndex(startCoord.dateStr, effectiveStartField);
        const startRowIndex = startCoord.rowIndex;

        // ★既存予定の上書き事故防止ガード:
        // 貼り付け対象の行に、すでに既存の実データ（空行・未割当ではない予定）が存在するか確認
        const overwrittenRealSchedules: Schedule[] = [];
        for (let rOffset = 0; rOffset < parsedRows.length; rOffset++) {
          const targetRowIndex = startRowIndex + rOffset;
          const blended = getSortedDaySchedules(startCoord.dateStr);
          const targetSched = blended[targetRowIndex];
          if (targetSched && !isTempSchedule(targetSched)) {
            if (targetSched.property_name || targetSched.staff_name) {
              overwrittenRealSchedules.push(targetSched);
            }
          }
        }

        if (overwrittenRealSchedules.length > 0) {
          const sampleList = overwrittenRealSchedules
            .slice(0, 3)
            .map(s => `・${s.property_name || '（物件名なし）'} (${s.staff_name || '担当未設定'})`)
            .join('\n');
          const extraMsg = overwrittenRealSchedules.length > 3 ? `\n...他 ${overwrittenRealSchedules.length - 3} 件` : '';
          const confirmMsg = `⚠️ 【既存予定への上書き警告】\n貼り付け先のセルに既存の予定が ${overwrittenRealSchedules.length} 件含まれています。\n\n${sampleList}${extraMsg}\n\nこの既存予定を上書きして貼り付けを実行しますか？\n（※誤って貼り付けた場合でも、直後に Ctrl + Z で元に戻せます）`;
          if (!window.confirm(confirmMsg)) {
            return;
          }
        }

        // ★Undo用に変更前の実データをバックアップ
        lastPasteBackupRef.current = {
          overwrittenSchedules: overwrittenRealSchedules.map(s => ({ ...s }))
        };

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
                    work_type: '',
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
              let finalVal = val;
              if (targetField === 'target_time') {
                finalVal = normalizeTargetTime(val);
              } else if (targetField === 'time_limit') {
                finalVal = toHalfWidth(val);
              }
              rowData.updateFields[targetField] = finalVal;

              if (targetField === 'staff_name') {
                const trimmedName = val.trim();
                if (trimmedName !== '') {
                  const matchedStaff = findStaffByName(staff, trimmedName);
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

          // 依頼番号が貼り付けられた行は FC 同期データから未入力項目を補完する
          for (const key of Object.keys(rowUpdates)) {
            const rowData = rowUpdates[key];
            const pastedRefno = rowData.updateFields.request_number;
            if (typeof pastedRefno === 'string' && pastedRefno.trim() !== '') {
              const current = { ...rowData.targetSched, ...rowData.updateFields };
              const patch = await buildFcAutofillPatch(pastedRefno, current);
              if (patch) Object.assign(rowData.updateFields, patch);
            }
          }

          // 二重ループ完了後に、行ごとに1回だけ onSave を呼び出す
          for (const key of Object.keys(rowUpdates)) {
            const rowData = rowUpdates[key];
            if (rowData.isTargetTemp) {
              const payload: Partial<Schedule> = {
                status: 'free',
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

          // ★貼り付け完了トースト（Undoボタン付き）
          const pasteCount = Object.keys(rowUpdates).length;
          setPasteToast({
            message: `📋 ${pasteCount}件の予定を貼り付けました`
          });
          if (pasteToastTimerRef.current) clearTimeout(pasteToastTimerRef.current);
          pasteToastTimerRef.current = setTimeout(() => setPasteToast(null), 8000);
        } catch (err) {
          console.error('Failed to paste cells:', err);
          alert('貼り付けに失敗しました。');
        }
      } else if (copiedSchedule) {
        // クリップボードが空で、システム内コピーが存在する場合のみ予定全体を複製
        e.preventDefault();

        let startCoord: { dateStr: string; rowIndex: number; field: keyof Schedule } | null = calendarSelectionRangeRef.current ? {
          dateStr: calendarSelectionRangeRef.current.startDateStr,
          rowIndex: calendarSelectionRangeRef.current.startRow,
          field: calendarSelectionRangeRef.current.startField
        } : null;
        if (!startCoord && selectedCell) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedCell.id);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: selectedCell.field };
              break;
            }
          }
        } else if (!startCoord && selectedScheduleId) {
          for (const dateStr of calendarDates) {
            const daySchedules = getSortedDaySchedules(dateStr);
            const rIdx = daySchedules.findIndex(s => s.id === selectedScheduleId);
            if (rIdx !== -1) {
              startCoord = { dateStr, rowIndex: rIdx, field: 'type' };
              break;
            }
          }
        }

        if (startCoord) {
          const blended = getSortedDaySchedules(startCoord.dateStr);
          const targetSched = blended[startCoord.rowIndex];
          if (targetSched) {
            // 既存の実データが存在する場合は上書き警告
            if (!isTempSchedule(targetSched) && (targetSched.property_name || targetSched.staff_name)) {
              const confirmMsg = `⚠️ 【既存予定への上書き警告】\n貼り付け先に「${targetSched.property_name || '名称未設定'} (${targetSched.staff_name || '担当未設定'})」が存在します。\n上書きして貼り付けますか？\n（※誤って貼り付けた場合でも Ctrl+Z で元に戻せます）`;
              if (!window.confirm(confirmMsg)) {
                return;
              }
              lastPasteBackupRef.current = {
                overwrittenSchedules: [{ ...targetSched }]
              };
            }

            const matchedStaff = staff.find(st => st.id === targetSched.staff_id) || findStaffByName(staff, targetSched.staff_name);
            const tStaffId = matchedStaff ? matchedStaff.id : (targetSched.staff_id || 0);
            await handlePaste(startCoord.dateStr, tStaffId);

            setPasteToast({
              message: `📋 1件の予定を貼り付けました`
            });
            if (pasteToastTimerRef.current) clearTimeout(pasteToastTimerRef.current);
            pasteToastTimerRef.current = setTimeout(() => setPasteToast(null), 8000);
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
  }, [selectedScheduleId, copiedSchedule, selectedEmptyCell, selectedCell, schedules, staff, workTypes, editingCell]);

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

    // メタデータ除去ヘルパー
    const cleanMetadata = (val: any): string => {
      if (!val) return '';
      return String(val)
        .replace(/\s*\[__parent_id:\d+__\]/g, '')
        .replace(/\s*\[__no_sync__\]/g, '')
        .trim();
    };

    // 検索一致判定
    const cellValueStr = schedule[field] ? cleanMetadata(schedule[field]).toLowerCase() : '';
    const isCellSearchMatch = searchQuery && cellValueStr.includes(searchQuery.toLowerCase());
    const searchMatchClass = isCellSearchMatch ? 'cell-search-match' : '';

    const cellId = `cell-${schedule.date}-${rowIndex}-${field}`;
    const isLockedByOther = typeof schedId === 'number' && Boolean(activeLocks[schedId]);
    const lockInfo = typeof schedId === 'number' ? activeLocks[schedId] : undefined;

    if (isEditing) {
      return (
        <td id={cellId} className={className} style={style}>
          <InlineInput
            initialValue={field === 'target_time' ? normalizeTargetTime(cleanMetadata(schedule[field])) : (field === 'time_limit' ? toHalfWidth(cleanMetadata(schedule[field])) : cleanMetadata(schedule[field]))}
            field={field}
            workTypes={workTypes}
            onSave={(val) => handleInlineSave(schedId, field, val)}
            onCancel={() => setEditingCell(null)}
          />
        </td>
      );
    }

    const value = schedule[field];
    const selectionClass = getSelectionClassName(schedule.date, rowIndex, field);
    const cellClass = `${className} ${selectionClass} ${searchMatchClass}`;
    
    if (field === 'staff_name') {
      const matchedStaff = staff.find(st => st.id === schedule.staff_id) || findStaffByName(staff, value as string | null | undefined);
      const avatarUrl = matchedStaff?.avatar_url;
      const isUnassigned = !value;

      return (
        <td 
          id={cellId}
          className={cellClass} 
          style={{ ...style, padding: '0.35rem 0.35rem' }}
          title={title ? cleanMetadata(title) : (matchedStaff?.name || cleanMetadata(value))}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
          onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
          onDoubleClick={() => {
            if (isLockedByOther) {
              alert(`現在、${lockInfo?.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
              return;
            }
            setEditingCell({ id: schedId, field });
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%' }}>
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={cleanMetadata(value)} 
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
                fontSize: String(value || '').trim().match(/^(FE|SF|FR)/i) ? '0.52rem' : '0.65rem', 
                fontWeight: 'bold',
                flexShrink: 0
              }}>
                {(() => {
                  const str = String(value || '').trim();
                  const match = str.match(/^(FE|SF|FR)/i);
                  if (match) return match[1].toUpperCase();
                  return getShortName(cleanMetadata(value)).substring(0, 1);
                })()}
              </div>
            ) : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getShortName(cleanMetadata(value || ''))}
            </span>
          </div>
          {isBottomRightSelectedCell(schedule.date, rowIndex, field) && (
            <div className="cell-fill-handle" />
          )}
        </td>
      );
    }
    
    if (field === 'property_name') {
      const isTemp = typeof schedId === 'string' && (schedId.startsWith('temp-') || schedId.startsWith('dummy-'));
      const isCoWorkerSched = schedule.notes && schedule.notes.includes('[__parent_id:');

      return (
        <td 
          id={cellId}
          className={cellClass} 
          style={style}
          title={title ? cleanMetadata(title) : undefined}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
          onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
          onDoubleClick={() => {
            if (isLockedByOther) {
              alert(`現在、${lockInfo?.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
              return;
            }
            setEditingCell({ id: schedId, field });
          }}
        >
          <div className="property-cell-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', flex: 1 }}>
              {isCoWorkerSched && (
                <span className="co-worker-badge" style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  color: '#7c3aed',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  fontSize: '0.68rem',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}>
                  同行
                </span>
              )}
              {isLockedByOther && (
                <span className="editing-lock-badge" title={`${lockInfo?.userName} さんが編集中`}>
                  <Lock size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                  {getShortName(lockInfo?.userName || '')}編集中
                </span>
              )}
              <span className="property-cell-text cell-clamp-2" style={{ flex: 1 }}>
                {cleanMetadata(value)}
              </span>
            </div>
            {!isTemp && (
              <button
                type="button"
                className="cell-edit-modal-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEditModal(schedule);
                }}
                title="予定を編集"
              >
                <Edit2 size={12} />
              </button>
            )}
          </div>
          {isBottomRightSelectedCell(schedule.date, rowIndex, field) && (
            <div className="cell-fill-handle" />
          )}
        </td>
      );
    }

    if (field === 'co_worker') {
      const coWorkersStr = (value as string) || '';
      const coWorkersList = splitCoWorkers(coWorkersStr, staff);

      return (
        <td 
          id={cellId}
          className={cellClass} 
          style={style}
          title={title ? cleanMetadata(title) : undefined}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
          onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
          onDoubleClick={() => {
            if (isLockedByOther) {
              alert(`現在、${lockInfo?.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
              return;
            }
            setEditingCell({ id: schedId, field });
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', flexWrap: 'wrap' }}>
            {coWorkersList.map((stName, idx) => {
              const matchedStaff = findStaffByName(staff, stName);
              const avatarUrl = matchedStaff?.avatar_url;
              const shortName = getShortName(stName);

              return (
                <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 3px', borderRadius: '3px' }}>
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt={shortName} 
                      style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                    />
                  ) : (
                    <div style={{ 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      backgroundColor: 'var(--primary, #4f46e5)', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '0.6rem', 
                      fontWeight: 'bold',
                      flexShrink: 0
                    }}>
                      {shortName.substring(0, 1)}
                    </div>
                  )}
                  <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {shortName}
                  </span>
                </div>
              );
            })}
          </div>
          {isBottomRightSelectedCell(schedule.date, rowIndex, field) && (
            <div className="cell-fill-handle" />
          )}
        </td>
      );
    }

    return (
      <td 
        id={cellId}
        className={cellClass} 
        style={style}
        title={title ? cleanMetadata(title) : undefined}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => handleCellMouseDown(e, schedule.date, rowIndex, field, schedId)}
        onMouseEnter={() => handleCellMouseEnter(schedule.date, rowIndex, field)}
        onDoubleClick={() => {
          if (field === 'staff_id' || field === 'division') {
            return;
          }
          if (isLockedByOther) {
            alert(`現在、${lockInfo?.userName} さんがこの予定を編集中です。\n同時に変更することはできません。`);
            return;
          }
          setEditingCell({ id: schedId, field });
        }}
      >
        {field === 'target_time' ? (
          normalizeTargetTime(cleanMetadata(value))
        ) : field === 'time_limit' ? (
          toHalfWidth(cleanMetadata(value))
        ) : field === 'description' ? (
          <div className="cell-clamp-3">{cleanMetadata(value)}</div>
        ) : field === 'notes' ? (
          <div className="cell-clamp-2">{cleanMetadata(value)}</div>
        ) : (
          cleanMetadata(value)
        )}
        {isBottomRightSelectedCell(schedule.date, rowIndex, field) && (
          <div className="cell-fill-handle" />
        )}
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

    const workTypeVal = quickWorkType === 'その他' 
      ? (quickCustomWorkType.trim() || 'その他') 
      : quickWorkType;

    const isHoliday = workTypeVal === '休暇';
    const propertyName = isHoliday ? '（休暇）' : '（社内用務）';

    try {
      const uniqueStaffIds = Array.from(new Set(quickStaffIds));

      for (const staffId of uniqueStaffIds) {
        const matchedStaff = staff.find(st => st.id === staffId);
        if (!matchedStaff) continue;

        const payload: Partial<Schedule> = {
          status: 'confirmed',
          date: dateStr,
          work_type: workTypeVal,
          staff_id: matchedStaff.id,
          staff_name: matchedStaff.name,
          target_time: normalizeTargetTime(quickTargetTime.trim()) || (isHoliday ? '終日' : '指定なし'),
          property_name: propertyName,
          course: matchedStaff.default_course || null,
          division: matchedStaff.default_course && Number(matchedStaff.default_course) >= 90 ? '委託' : 'FTS'
        };
        await onSave(payload);
      }

      setActiveAddFormDate(null);
      setQuickStaffIds([]);
      setShowStaffDropdown(null);
      setQuickCustomWorkType('');
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
          target_time: normalizeTargetTime(popupTargetTime.trim()) || (isHoliday ? '終日' : '指定なし'),
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
            target_time: normalizeTargetTime(popupTargetTime.trim()) || (isHoliday ? '終日' : '指定なし'),
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
        </div>
        <div className="matrix-controls">
          <div className="matrix-nav-buttons date-group">
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
          </div>
          <div className="matrix-nav-buttons action-group">
            <button 
              type="button"
              className={`btn btn-secondary btn-sm-nav ${showFullText ? 'active' : ''}`} 
              onClick={() => setShowFullText(!showFullText)} 
              title={showFullText ? "2〜3行の標準折り返し表示に戻します" : "すべての予定の物件名・作業内容・備考等のテキストを折り返して全行展開します"}
              style={showFullText ? { backgroundColor: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : undefined}
            >
              {showFullText ? <EyeOff size={14} style={{ marginRight: '4px' }} /> : <Eye size={14} style={{ marginRight: '4px' }} />}
              <span>{showFullText ? '標準表示に戻す' : '全文表示に切替'}</span>
            </button>
            <button 
              className="btn btn-secondary btn-sm-nav" 
              onClick={onOpenPasteImportModal} 
              title="Excelやスプレッドシートからコピーしたデータを貼り付け"
            >
              スプレッドシートから貼り付け
            </button>
            <button 
              className="btn btn-primary btn-sm-nav" 
              onClick={() => onOpenAddModal(getLocalDateString(currentDate))} 
              title="新規予定を追加"
            >
              <Plus size={14} style={{ marginRight: '4px' }} />
              予定を追加
            </button>
            <div className="calendar-search-wrapper">
              <Search size={14} className="calendar-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="calendar-search-input"
                placeholder="号機・物件名・対応者で検索 (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="calendar-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="検索をクリア"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="matrix-table-wrapper">
        <div
          ref={calendarContainerRef}
          className="matrix-table-zoom-inner calendar-zoom-inner"
          style={zoomLevel !== 100 ? {
            zoom: `${zoomLevel}%`,
            minHeight: `calc(100% / ${zoomLevel / 100})`,
            width: 'max-content',
            display: 'flex',
            flexDirection: 'column',
          } : {
            width: 'max-content',
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Selection Overlay (遅延0ms・完全スプレッドシート浮遊レイヤー) */}
          <div
            ref={calendarSelectionOverlayRef}
            id="calendar-selection-overlay"
            className="calendar-selection-overlay"
          >
            <div className="calendar-selection-overlay-handle" />
          </div>

          {/* Copy Overlay (破線アニメーション枠) */}
          <div
            ref={calendarCopyOverlayRef}
            id="calendar-copy-overlay"
            className="calendar-copy-overlay"
          />

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
              
              // 同行でコース番号が振られていない人は除外
              const isCoWorkerChild = s.notes && s.notes.includes('[__parent_id:');
              if (isCoWorkerChild) {
                const courseStr = String(s.course || '').trim();
                if (!courseStr) return false;
              }

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
                      <table className={`day-calendar-table ${showFullText ? 'show-full-text' : ''}`}>
                        <colgroup>
                          <col style={{ width: '65px' }} /> {/* タイプ (見切れ防止のため幅を確保) */}
                          <col style={{ width: '45px' }} /> {/* BOX */}
                          <col style={{ width: '65px' }} /> {/* 号機 */}
                          <col style={{ width: '200px' }} /> {/* 物件名 (2行折り返し時に収まりやすいよう拡張) */}
                          <col style={{ width: '105px' }} /> {/* 種別 (「依頼者承認済」が見切れないよう拡張) */}
                          <col style={{ width: '250px' }} /> {/* 作業内容 (3行折り返し時にしっかり読めるよう拡張) */}
                          <col style={{ width: '75px' }} /> {/* 時間 */}
                          <col style={{ width: '115px' }} /> {/* 対応者 (FE/SF/FR等委託スタッフの見切れ防止のため拡張) */}
                          <col style={{ width: '75px' }} /> {/* エリア */}
                          <col style={{ width: '65px' }} /> {/* 県別 */}
                          <col style={{ width: '65px' }} /> {/* 移動 */}
                          <col style={{ width: '85px' }} /> {/* 同行者 */}
                          <col style={{ width: '100px' }} /> {/* 依頼番号 */}
                          <col style={{ width: '45px' }} /> {/* TIME */}
                          <col style={{ width: '45px' }} /> {/* コース */}
                          <col style={{ width: '150px' }} /> {/* 備考 */}
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
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '12px',
                                padding: '4px 12px',
                                width: '100%',
                                minHeight: '38px',
                                boxSizing: 'border-box'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span className="day-name-super" style={{ color: '#000000', fontWeight: 'bold' }}>
                                    {day.dayName}曜日{holidayName ? `・${holidayName}` : ''}
                                  </span>
                                  <span className="day-date-super" style={{ fontSize: '0.75rem', color: '#000000', fontWeight: 'bold', opacity: 0.9 }}>({day.date.getMonth() + 1}/{day.date.getDate()})</span>
                                </div>
                                <div className="transfer-action-area" style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  flexShrink: 0
                                }}>
                                  {isAllTransferred && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(22, 163, 74, 0.15)', color: '#16a34a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
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
                                        padding: '3px 10px', 
                                        fontSize: '0.75rem', 
                                        height: '24px', 
                                        lineHeight: 1,
                                        whiteSpace: 'nowrap',
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
                                  
                                  const staffLabel = group.staff_names.length > 0 ? ` (${group.staff_names.map(n => getShortName(n)).join(', ')})` : '';
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
                                    <div style={{ width: '100%', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px', textAlign: 'left', borderBottom: '1px solid var(--border-cell)', paddingBottom: '3px', whiteSpace: 'nowrap' }}>休暇・社内予定の簡易登録</div>
                                    <select
                                      className="quick-form-control quick-select-worktype"
                                      value={quickWorkType}
                                      onChange={(e) => setQuickWorkType(e.target.value)}
                                    >
                                      {workTypes.filter(t => t.is_internal === 1).map(t => (
                                        <option key={t.id} value={t.name}>{t.name}</option>
                                      ))}
                                      <option value="その他">その他（自由入力）</option>
                                    </select>

                                    {quickWorkType === 'その他' && (
                                      <input
                                        type="text"
                                        className="quick-form-control"
                                        placeholder="予定名を入力"
                                        value={quickCustomWorkType}
                                        onChange={(e) => setQuickCustomWorkType(e.target.value)}
                                        style={{ width: '110px' }}
                                        autoFocus
                                      />
                                    )}

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
                                        setQuickCustomWorkType('');
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
                                      setQuickCustomWorkType('');
                                      setActiveAddFormDate(day.dateStr);
                                    }}
                                  >
                                    ＋ 休暇・社内予定を追加
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

                               // 検索一致判定
                               const isSearchMatch = searchQuery ? (
                                 (schedule.property_name && schedule.property_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                 (schedule.staff_name && schedule.staff_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                 (schedule.unit_number && schedule.unit_number.toLowerCase().includes(searchQuery.toLowerCase()))
                               ) : false;

                               let searchClass = '';
                               if (searchQuery) {
                                 searchClass = isSearchMatch ? 'row-search-match' : 'row-search-no-match';
                               }

                              const isSelected = typeof schedule.id === 'number' && selectedScheduleIds.includes(schedule.id);

                              return (
                                <tr 
                                  key={rowIndex} 
                                  className={`parallel-calendar-row ${isSelected ? 'selected-row' : ''} ${searchClass}`}
                                  onClick={(e) => {
                                    // Ctrl または Shift キーが押されている時のみ、複数行一括操作用の行選択を発火
                                    if (e.ctrlKey || e.shiftKey || e.metaKey) {
                                      handleSelectRow(e, schedule);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    const menuWidth = 240;
                                    const menuHeight = 360;
                                    
                                    let x = e.clientX;
                                    let y = e.clientY;
                                    
                                    if (x + menuWidth > window.innerWidth) {
                                      x = Math.max(0, window.innerWidth - menuWidth - 10);
                                    }
                                    if (y + menuHeight > window.innerHeight) {
                                      y = Math.max(0, window.innerHeight - menuHeight - 10);
                                    }

                                    let currentSelectedIds: number[] = [];
                                    if (selectedScheduleIds.length > 1 && typeof schedule.id === 'number' && selectedScheduleIds.includes(schedule.id)) {
                                      currentSelectedIds = selectedScheduleIds;
                                    } else {
                                      currentSelectedIds = typeof schedule.id === 'number' ? [schedule.id] : [];
                                      setSelectedScheduleIds([]);
                                      setSelectedScheduleId(schedule.id);
                                      lastSelectedScheduleIdRef.current = typeof schedule.id === 'number' ? schedule.id : null;
                                    }

                                    setContextMenu({
                                      x,
                                      y,
                                      schedule,
                                      selectedIds: currentSelectedIds
                                    });
                                  }}
                                >
                                  {renderEditableCell(schedule, rowIndex, 'type', `${statusClass} first-status-cell ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'box', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'unit_number', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'property_name', `${statusClass} ${isToday ? 'today-td' : ''} font-bold-cell`, schedule.property_name)}
                                  {renderEditableCell(schedule, rowIndex, 'work_type', `${statusClass} ${isToday ? 'today-td' : ''}`)}
                                  {renderEditableCell(schedule, rowIndex, 'description', `${statusClass} ${isToday ? 'today-td' : ''}`, schedule.description || '')}
                                  {renderEditableCell(schedule, rowIndex, 'target_time', `${statusClass} ${isToday ? 'today-td' : ''} time-limit-cell`, undefined, {
                                    color: schedule.target_time === '必ず' ? 'var(--danger)' : 'inherit',
                                    fontWeight: schedule.target_time === '必ず' ? 'bold' : 'normal'
                                  })}
                                  {editingCell?.id === schedule.id && editingCell?.field === 'staff_name' ? (
                                    <td id={`cell-${day.dateStr}-${rowIndex}-staff_name`} className={`${statusClass} ${isToday ? 'today-td' : ''}`}>
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
                                    (() => {
                                      const isStaffNameMatch = searchQuery && schedule.staff_name && schedule.staff_name.toLowerCase().includes(searchQuery.toLowerCase());
                                      const staffSearchClass = isStaffNameMatch ? 'cell-search-match' : '';
                                      return (
                                        <td 
                                          id={`cell-${day.dateStr}-${rowIndex}-staff_name`}
                                          className={`${statusClass} ${isToday ? 'today-td' : ''} ${getSelectionClassName(day.dateStr, rowIndex, 'staff_name')} ${staffSearchClass}`}
                                          style={{ padding: '0.35rem 0.35rem' }}
                                          title={staffMember ? staffMember.name : (schedule.staff_name || undefined)}
                                          onClick={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => handleCellMouseDown(e, day.dateStr, rowIndex, 'staff_name', schedule.id)}
                                          onMouseEnter={() => handleCellMouseEnter(day.dateStr, rowIndex, 'staff_name')}
                                          onDoubleClick={() => {
                                            setEditingCell({ id: schedule.id, field: 'staff_name' });
                                          }}
                                        >
                                          {staffMember ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%' }}>
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
                                                  fontSize: staffMember.name.match(/^(FE|SF|FR)/i) ? '0.52rem' : '0.65rem', 
                                                  fontWeight: 'bold',
                                                  flexShrink: 0
                                                }}>
                                                  {(() => {
                                                    const match = staffMember.name.match(/^(FE|SF|FR)/i);
                                                    if (match) return match[1].toUpperCase();
                                                    return getShortName(staffMember.name).substring(0, 1);
                                                  })()}
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
                                      );
                                    })()
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
                                <tr 
                                  key={rowIndex} 
                                  className="parallel-calendar-row"
                                  onClick={() => {
                                    setSelectedScheduleIds([]);
                                    setSelectedScheduleId(null);
                                    setSelectedEmptyCell(null);
                                  }}
                                >
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
      </div>

      {/* 簡易コンテキストメニュー */}
      {contextMenu && (
        <div 
          className="custom-context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.selectedIds && contextMenu.selectedIds.length > 1 ? (
            <>
              <div className="custom-context-menu-header">
                {contextMenu.selectedIds.length}件を選択中
              </div>
              <button 
                type="button" 
                onClick={() => {
                  const ids = contextMenu.selectedIds;
                  setContextMenu(null);
                  handleBulkStatusChange('confirmed', ids);
                }}
                style={{ color: '#ef4444', fontWeight: 600 }}
              >
                選択した予定を【確定】に変更
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const ids = contextMenu.selectedIds;
                  setContextMenu(null);
                  handleBulkStatusChange('draft', ids);
                }}
                style={{ color: '#eab308', fontWeight: 600 }}
              >
                選択した予定を【仮】に変更
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const ids = contextMenu.selectedIds;
                  setContextMenu(null);
                  handleBulkStatusChange('cancelled', ids);
                }}
                style={{ color: '#94a3b8' }}
              >
                選択した予定を【キャンセル】に変更
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const ids = contextMenu.selectedIds;
                  setContextMenu(null);
                  handleOpenMoveModal(ids);
                }}
              >
                別日へ移動
              </button>
              <div className="popup-divider" style={{ margin: '4px 0' }}></div>
              <button 
                type="button" 
                className="delete-menu-item"
                onClick={() => {
                  const ids = contextMenu.selectedIds;
                  setContextMenu(null);
                  handleBulkDelete(ids);
                }}
              >
                選択した予定を一括削除
              </button>
            </>
          ) : contextMenu.schedule && !isTempSchedule(contextMenu.schedule) ? (
            <>
              <button 
                type="button" 
                onClick={() => {
                  const sched = contextMenu.schedule!;
                  setCopiedSchedule(sched);
                  setSelectedScheduleId(sched.id);
                  setContextMenu(null);

                  const rowText = FIELD_ORDER.map(field => formatTsvCell(sched[field])).join('\t');
                  navigator.clipboard.writeText(rowText).catch(err => {
                    console.error('Failed to write to clipboard:', err);
                  });
                  setCopyToast('📋 予定をコピーしました');
                  if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
                  copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);
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
                ✏️ 予定を編集
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const id = contextMenu.schedule!.id;
                  setContextMenu(null);
                  if (typeof id === 'number') {
                    handleOpenMoveModal([id]);
                  }
                }}
              >
                別日へ移動
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
                  style={{ color: '#ef4444', fontWeight: 600 }}
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
                  style={{ color: '#eab308', fontWeight: 600 }}
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
                  style={{ color: '#94a3b8' }}
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
                    const matchedStaff = findStaffByName(staff, tempStaffName);
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

      {/* 複数選択時の画面下部フローティング一括操作バー */}
      {selectedScheduleIds.length > 1 && (
        <div className="bulk-action-floating-bar">
          <div className="bulk-action-info">
            <span className="bulk-action-badge">{selectedScheduleIds.length}</span> 件選択中
          </div>
          <div className="bulk-action-buttons">
            <button
              type="button"
              className="btn btn-sm btn-bulk-status btn-bulk-confirmed"
              onClick={() => handleBulkStatusChange('confirmed')}
              disabled={isBulkOperating}
              title="選択した予定をすべて確定にします"
            >
              一括【確定】
            </button>
            <button
              type="button"
              className="btn btn-sm btn-bulk-status btn-bulk-draft"
              onClick={() => handleBulkStatusChange('draft')}
              disabled={isBulkOperating}
              title="選択した予定をすべて仮にします"
            >
              一括【仮】
            </button>
            <button
              type="button"
              className="btn btn-sm btn-bulk-status btn-bulk-cancelled"
              onClick={() => handleBulkStatusChange('cancelled')}
              disabled={isBulkOperating}
              title="選択した予定をすべてキャンセルにします"
            >
              一括【キャンセル】
            </button>
            <button
              type="button"
              className="btn btn-sm btn-bulk-primary"
              onClick={() => handleOpenMoveModal()}
              disabled={isBulkOperating}
              title="選択した予定を別の日付に移動または振替します"
            >
              別日へ移動
            </button>
            <button
              type="button"
              className="btn btn-sm btn-bulk-danger"
              onClick={() => handleBulkDelete()}
              disabled={isBulkOperating}
              title="選択した予定を削除します"
            >
              一括削除
            </button>
            <button
              type="button"
              className="btn btn-sm btn-bulk-clear"
              onClick={() => {
                setSelectedScheduleIds([]);
                setSelectedScheduleId(null);
              }}
              disabled={isBulkOperating}
            >
              選択解除
            </button>
          </div>
        </div>
      )}

      {/* 「別日へ移動」モーダルダイアログ */}
      {isMoveModalOpen && (
        <div className="move-modal-overlay" onClick={() => !isMoving && setIsMoveModalOpen(false)}>
          <div className="move-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="move-modal-header">
              <h3>別日へ移動</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={isMoving}
              >
                ✕
              </button>
            </div>
            
            <div className="move-modal-body">
              <div className="move-modal-info">
                対象予定: <strong>{targetMoveScheduleIds.length}件</strong>
              </div>

              {/* 対象予定のサマリー一覧 */}
              <div className="move-target-list">
                {schedules
                  .filter(s => targetMoveScheduleIds.includes(Number(s.id)))
                  .map(s => (
                    <div key={s.id} className="move-target-item">
                      <span className="move-target-date">{s.date}</span>
                      <span className="move-target-name">{s.property_name || '物件未設定'}</span>
                      <span className="move-target-type">{s.work_type}</span>
                      {s.staff_name && <span className="move-target-staff">{getShortName(s.staff_name)}</span>}
                    </div>
                  ))}
              </div>

              {/* 移動先日付 */}
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" style={{ fontWeight: 'bold' }}>
                  移動先の日付 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={destinationDate}
                  onChange={(e) => setDestinationDate(e.target.value)}
                  disabled={isMoving}
                  required
                />
              </div>

              {/* 移動モード（キャンセル残し振替 or 日付直接変更） */}
              <div className="move-option-box" style={{ marginTop: '14px' }}>
                <label className="checkbox-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={keepAsCancelled}
                    onChange={(e) => setKeepAsCancelled(e.target.checked)}
                    disabled={isMoving}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                      元の予定を【キャンセル】として残す（振替・履歴保持）
                    </span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      {keepAsCancelled
                        ? '※ 元の予定はステータス「キャンセル」となり、備考欄に「〇/〇へ移動」が自動記録されます。移動先の日付に同一内容の新しい予定（フリー状態）が作成されます。'
                        : '※ 元の予定の日付が直接変更されます（履歴は残りません）。'}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="move-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={isMoving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteMove}
                disabled={isMoving || !destinationDate}
              >
                {isMoving ? '移動処理中...' : '別日へ移動を実行'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* スプレッドシート風コピートースト通知 */}
      {copyToast && (
        <div className="spreadsheet-copy-toast">
          <span>{copyToast}</span>
        </div>
      )}

      {/* 貼り付け後のUndo（元に戻す）トースト通知 */}
      {pasteToast && (
        <div 
          className="spreadsheet-copy-toast spreadsheet-paste-toast"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
            border: '1px solid #334155'
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{pasteToast.message}</span>
          <button
            type="button"
            onClick={handleUndoPaste}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '5px 12px',
              fontSize: '0.82rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
          >
            ↩️ 元に戻す (Ctrl+Z)
          </button>
        </div>
      )}
    </div>
  );
};

function isConfirmed(status: string) {
  return status === 'confirmed';
}
