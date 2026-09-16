import React, { useState, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import type { Schedule, Staff, UserRole, WorkType } from '../types';
import { getShortName, cleanMetadata, splitCoWorkers, canManageSchedules, normalizeTargetTime, compareSchedules, toHalfWidth, findStaffByName } from '../types';
import { buildFcAutofillPatch } from '../utils/fcAutofill';

import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, CheckCircle2, Download, Eye, EyeOff, Printer, Lock, ArrowUpDown, RotateCcw, Edit2 } from 'lucide-react';
import { PrintPreviewModal } from './PrintPreviewModal';
import './GridView.css';

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
        if (nextChar === '\n') i++;
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

const formatTsvCell = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const GRID_COLUMNS: (keyof Schedule)[] = [
  'division',
  'type',
  'box',
  'unit_number',
  'property_name',
  'work_type',
  'description',
  'target_time',
  'staff_name',
  'area',
  'transport',
  'co_worker',
  'request_number',
  'result',
  'notes'
];

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
  onOpenAddModal,
  onOpenEditModal,
  onSave,
  currentUserRole,
  currentStaffId,
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

  const [sortColumn, setSortColumn] = useState<'default' | 'unit_number' | 'property_name' | 'target_time' | 'staff_name'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Googleスプレッドシート完全同等: Selection Overlay アーキテクチャ（遅延0ms・React再レンダリング0回）
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const selectionOverlayRef = useRef<HTMLDivElement | null>(null);
  const copyOverlayRef = useRef<HTMLDivElement | null>(null);

  const selectionRangeRef = useRef<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
  } | null>(null);

  const copiedRangeRef = useRef<{
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
  } | null>(null);

  const isSelectingRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const selectionStartCoordRef = useRef<{ rowIndex: number; colIndex: number } | null>(null);

  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<any>(null);

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

  const handleSortToggle = (column: 'unit_number' | 'property_name' | 'target_time' | 'staff_name') => {
    clearSelectionOverlay();
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

  // Googleスプレッドシート完全同等: 青枠オーバーレイを 0.001ms で対象範囲にワープ
  const updateSelectionOverlayDom = (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ) => {
    if (!tableContainerRef.current || !selectionOverlayRef.current) return;
    const container = tableContainerRef.current;
    const overlay = selectionOverlayRef.current;

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    const startTd = document.getElementById(`grid-cell-${minRow}-${minCol}`);
    const endTd = document.getElementById(`grid-cell-${maxRow}-${maxCol}`);

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

    const isMultiCell = minRow !== maxRow || minCol !== maxCol;
    if (isMultiCell) {
      overlay.classList.add('is-multi-cell');
    } else {
      overlay.classList.remove('is-multi-cell');
    }

    selectionRangeRef.current = {
      startRow,
      startCol,
      endRow,
      endCol,
      minRow,
      maxRow,
      minCol,
      maxCol,
    };
  };

  const updateCopyOverlayDom = () => {
    if (!tableContainerRef.current || !copyOverlayRef.current) return;
    const container = tableContainerRef.current;
    const overlay = copyOverlayRef.current;

    if (!copiedRangeRef.current) {
      overlay.style.display = 'none';
      return;
    }

    const { minRow, maxRow, minCol, maxCol } = copiedRangeRef.current;
    const startTd = document.getElementById(`grid-cell-${minRow}-${minCol}`);
    const endTd = document.getElementById(`grid-cell-${maxRow}-${maxCol}`);

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

  const clearSelectionOverlay = () => {
    if (selectionOverlayRef.current) {
      selectionOverlayRef.current.style.display = 'none';
    }
    selectionRangeRef.current = null;
  };

  // セル描画の超軽量化: クラス計算を全廃し、テーブル再描画コストを完全ゼロ化
  const getCellClassName = (_rowIndex: number, _colIndex: number, extraClass: string = '') => extraClass;
  const isBottomRightSelectedCell = (_rowIndex: number, _colIndex: number) => false;

  const handleCellMouseDown = (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    if (e.button !== 0) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || (e.target as HTMLElement).closest('button')) {
      return;
    }
    e.stopPropagation(); // 行選択（サイドバー表示）への伝播を防止

    isSelectingRef.current = true;
    isDraggingRef.current = false;
    selectionStartCoordRef.current = { rowIndex, colIndex };

    // ★遅延0ms・React再レンダリング0回でオーバーレイを瞬間移動！
    updateSelectionOverlayDom(rowIndex, colIndex, rowIndex, colIndex);
  };

  // ドラッグ中はReactの再レンダリングを完全バイパスし、直接オーバーレイを更新！
  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (!isSelectingRef.current || !selectionStartCoordRef.current) return;
    
    // 起点セルと同一セルの場合はスキップ（クリック時のわずかなマウスブレによる誤ドラッグを完全防止）
    if (selectionStartCoordRef.current.rowIndex === rowIndex && selectionStartCoordRef.current.colIndex === colIndex) {
      return;
    }

    // 起点と異なるセルに入った時のみドラッグ確定
    isDraggingRef.current = true;
    updateSelectionOverlayDom(
      selectionStartCoordRef.current.rowIndex,
      selectionStartCoordRef.current.colIndex,
      rowIndex,
      colIndex
    );
  };

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
      if (selectionRangeRef.current) {
        const { startRow, startCol, endRow, endCol } = selectionRangeRef.current;
        updateSelectionOverlayDom(startRow, startCol, endRow, endCol);
      }
      if (copiedRangeRef.current) {
        updateCopyOverlayDom();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 矢印キー移動（0.001ms・React再レンダリング0回）
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!selectionRangeRef.current) {
          if (sortedSchedules.length > 0) {
            updateSelectionOverlayDom(0, 0, 0, 0);
            const cellElem = document.getElementById('grid-cell-0-0');
            if (cellElem) {
              cellElem.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
            }
          }
          return;
        }
        e.preventDefault();
        let nextRow = selectionRangeRef.current.startRow;
        let nextCol = selectionRangeRef.current.startCol;

        if (e.key === 'ArrowUp') nextRow = Math.max(0, nextRow - 1);
        if (e.key === 'ArrowDown') nextRow = Math.min(sortedSchedules.length - 1, nextRow + 1);
        if (e.key === 'ArrowLeft') nextCol = Math.max(0, nextCol - 1);
        if (e.key === 'ArrowRight') nextCol = Math.min(GRID_COLUMNS.length - 1, nextCol + 1);

        updateSelectionOverlayDom(nextRow, nextCol, nextRow, nextCol);

        const cellElem = document.getElementById(`grid-cell-${nextRow}-${nextCol}`);
        if (cellElem) {
          cellElem.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'nearest'
          });
        }
        return;
      }

      // スプレッドシート完全準拠: Escapeキーでコピー破線マーキー枠を解除
      if (e.key === 'Escape') {
        if (copiedRangeRef.current) {
          copiedRangeRef.current = null;
          if (copyOverlayRef.current) {
            copyOverlayRef.current.style.display = 'none';
          }
          e.preventDefault();
          return;
        }
      }

      // Ctrl + C (コピー)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectionRangeRef.current) {
          const { minRow, maxRow, minCol, maxCol } = selectionRangeRef.current;

          let clipboardText = '';
          for (let r = minRow; r <= maxRow; r++) {
            const sched = sortedSchedules[r];
            let rowText = '';
            for (let c = minCol; c <= maxCol; c++) {
              const field = GRID_COLUMNS[c];
              const val = sched ? formatTsvCell(sched[field]) : '';
              rowText += (rowText ? '\t' : '') + val;
            }
            clipboardText += (clipboardText ? '\n' : '') + rowText;
          }

          navigator.clipboard.writeText(clipboardText).catch(err => {
            console.error('Failed to copy to clipboard:', err);
          });

          copiedRangeRef.current = { minRow, maxRow, minCol, maxCol };
          updateCopyOverlayDom();

          const rCount = maxRow - minRow + 1;
          const cCount = maxCol - minCol + 1;
          const countDesc = (rCount > 1 || cCount > 1) ? ` (${rCount}行×${cCount}列)` : '';
          setCopyToast(`📋 クリップボードにコピーしました${countDesc}`);
          if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
          copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);
          e.preventDefault();
          return;
        }
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (!text || text.trim() === '' || !selectionRangeRef.current) return;

      e.preventDefault();
      let parsedRows = parseTSV(text);

      // ★縦並びデータのスマート救済（横展開ガード）:
      if (parsedRows.length >= 10 && parsedRows.length <= 20 && parsedRows.every(r => r.length === 1)) {
        const horizontalCols = parsedRows.map(r => r[0]);
        parsedRows = [horizontalCols];
      }

      const isFullRowPaste = Math.max(...parsedRows.map(r => r.length)) >= 10;
      const startRow = selectionRangeRef.current.minRow;
      const startCol = isFullRowPaste ? 0 : selectionRangeRef.current.minCol;

      for (let rOffset = 0; rOffset < parsedRows.length; rOffset++) {
        const targetRow = startRow + rOffset;
        if (targetRow >= sortedSchedules.length) break;
        const targetSched = sortedSchedules[targetRow];
        if (!targetSched || typeof targetSched.id !== 'number') continue;

        const cols = parsedRows[rOffset];
        const updatePayload: Partial<Schedule> = { id: targetSched.id };

        for (let cOffset = 0; cOffset < cols.length; cOffset++) {
          const targetCol = startCol + cOffset;
          if (targetCol >= GRID_COLUMNS.length) break;
          const field = GRID_COLUMNS[targetCol];
          let val = cols[cOffset];

          if (field === 'target_time') val = normalizeTargetTime(val);
          if (field === 'time_limit') val = toHalfWidth(val);
          if (field === 'staff_name' && val) {
            const matchedStaff = findStaffByName(staff, val);
            if (matchedStaff) {
              (updatePayload as any).staff_id = matchedStaff.id;
              val = matchedStaff.name;
            }
          }

          (updatePayload as any)[field] = val;
        }

        // ミス防止: 依頼番号入力時はFC自動補完
        if (updatePayload.request_number) {
          const patch = await buildFcAutofillPatch(updatePayload.request_number, { ...targetSched, ...updatePayload });
          if (patch) Object.assign(updatePayload, patch);
        }

        try {
          await onSave(updatePayload);
        } catch (err) {
          console.error('Failed to paste schedule in GridView:', err);
        }
      }

      setCopyToast('📋 貼り付けが完了しました');
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2000);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [sortedSchedules, staff, onSave]);

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
          ref={tableContainerRef}
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
          {/* Googleスプレッドシート完全同等: Selection Overlay ＆ Copy Overlay */}
          <div ref={selectionOverlayRef} id="grid-selection-overlay" className="selection-overlay">
            <div className="selection-overlay-handle" />
          </div>
          <div ref={copyOverlayRef} id="grid-copy-overlay" className="copy-overlay" />

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
              sortedSchedules.map((schedule, rowIndex) => {
                const staffMember = staff.find(st => st.id === schedule.staff_id);
                const isCompleted = schedule.result === '完了';

                const isAdmin = canManageSchedules(currentUserRole);

                return (
                  <tr 
                    key={schedule.id} 
                    onDoubleClick={isAdmin ? () => onOpenEditModal(schedule) : undefined}
                    className={`spreadsheet-row ${isCompleted ? 'row-completed' : ''}`}
                  >
                    <td 
                      id={`grid-cell-${rowIndex}-0`}
                      className={getCellClassName(rowIndex, 0, '')}
                      style={{ textAlign: 'center', fontWeight: '500' }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 0)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 0)}
                    >
                      {schedule.division}
                      {isBottomRightSelectedCell(rowIndex, 0) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-1`}
                      className={getCellClassName(rowIndex, 1, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 1)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 1)}
                    >
                      {schedule.type}
                      {isBottomRightSelectedCell(rowIndex, 1) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-2`}
                      className={getCellClassName(rowIndex, 2, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 2)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 2)}
                    >
                      {schedule.box}
                      {isBottomRightSelectedCell(rowIndex, 2) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-3`}
                      className={getCellClassName(rowIndex, 3, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 3)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 3)}
                    >
                      {schedule.unit_number}
                      {isBottomRightSelectedCell(rowIndex, 3) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-4`}
                      className={getCellClassName(rowIndex, 4, 'bold-cell')}
                      title={schedule.property_name}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 4)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 4)}
                    >
                      <div className="property-cell-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '4px' }}>
                        <div className="cell-clamp-2" style={{ flex: 1 }}>
                          {schedule.property_name}
                          {typeof schedule.id === 'number' && activeLocks[schedule.id] && (
                            <span className="editing-lock-badge" title={`${activeLocks[schedule.id].userName} さんが編集中`} style={{ marginLeft: '6px' }}>
                              <Lock size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                              {getShortName(activeLocks[schedule.id].userName)}編集中
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="cell-edit-modal-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isAdmin) onOpenEditModal(schedule);
                          }}
                          title="予定を編集"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                      {isBottomRightSelectedCell(rowIndex, 4) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-5`}
                      className={getCellClassName(rowIndex, 5, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 5)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 5)}
                    >
                      {schedule.work_type}
                      {isBottomRightSelectedCell(rowIndex, 5) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-6`}
                      className={getCellClassName(rowIndex, 6, 'description-cell')}
                      title={schedule.description || ''}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 6)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 6)}
                    >
                      <div className="cell-clamp-3">
                        {schedule.description}
                      </div>
                      {isBottomRightSelectedCell(rowIndex, 6) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-7`}
                      className={getCellClassName(rowIndex, 7, 'time-cell')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 7)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 7)}
                    >
                      {normalizeTargetTime(schedule.target_time)}
                      {isBottomRightSelectedCell(rowIndex, 7) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-8`}
                      className={getCellClassName(rowIndex, 8, '')}
                      style={{ verticalAlign: 'middle' }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 8)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 8)}
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
                      {isBottomRightSelectedCell(rowIndex, 8) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-9`}
                      className={getCellClassName(rowIndex, 9, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 9)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 9)}
                    >
                      {schedule.area}
                      {isBottomRightSelectedCell(rowIndex, 9) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-10`}
                      className={getCellClassName(rowIndex, 10, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 10)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 10)}
                    >
                      {schedule.transport}
                      {isBottomRightSelectedCell(rowIndex, 10) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-11`}
                      className={getCellClassName(rowIndex, 11, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 11)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 11)}
                    >
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
                      {isBottomRightSelectedCell(rowIndex, 11) && <div className="cell-fill-handle" />}
                    </td>
                    <td 
                      id={`grid-cell-${rowIndex}-12`}
                      className={getCellClassName(rowIndex, 12, '')}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 12)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 12)}
                    >
                      {schedule.request_number}
                      {isBottomRightSelectedCell(rowIndex, 12) && <div className="cell-fill-handle" />}
                    </td>
                    
                    <td 
                      id={`grid-cell-${rowIndex}-13`}
                      className={getCellClassName(rowIndex, 13, '')}
                      style={{ textAlign: 'center', verticalAlign: 'middle' }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 13)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 13)}
                    >
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
                      {isBottomRightSelectedCell(rowIndex, 13) && <div className="cell-fill-handle" />}
                    </td>

                    <td 
                      id={`grid-cell-${rowIndex}-14`}
                      className={getCellClassName(rowIndex, 14, 'notes-cell')}
                      title={cleanMetadata(schedule.notes)}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, 14)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, 14)}
                    >
                      <div className="cell-clamp-2">
                        {cleanMetadata(schedule.notes)}
                      </div>
                      {isBottomRightSelectedCell(rowIndex, 14) && <div className="cell-fill-handle" />}
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


      {/* スプレッドシート風コピートースト通知 */}
      {copyToast && (
        <div className="spreadsheet-copy-toast">
          <span>{copyToast}</span>
        </div>
      )}
    </div>
  );
};
