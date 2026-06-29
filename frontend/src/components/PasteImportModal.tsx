import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './PasteImportModal.css';
import { resolveAddress } from '../utils/addressResolver';
import { findStaffByName } from '../types';
import type { Staff } from '../types';
interface PasteImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  userEmail?: string;
}

// 10列の固定項目定義
const FIXED_MAPPINGS = [
  'type',          // タイプ
  'box',           // BOX
  'unit_number',    // 号機
  'property_name', // 物件名
  'work_type',     // 種別
  'description',   // 作業内容
  'target_time',   // 時間
  'staff_name',    // 対応者
  'area',          // エリア
  'prefecture'     // 県別
];

const FIELD_LABELS: Record<string, string> = {
  type: 'タイプ',
  box: 'BOX',
  unit_number: '号機',
  property_name: '物件名（必須）',
  work_type: '種別',
  description: '作業内容',
  target_time: '時間',
  staff_name: '対応者',
  area: 'エリア',
  prefecture: '県別'
};

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 10; // 常に10列
const createEmptyGrid = (rows = DEFAULT_ROWS, cols = DEFAULT_COLS): string[][] =>
  Array(rows).fill(null).map(() => Array(cols).fill(''));

// TSVを正しくパースする関数（ダブルクォーテーション内の改行・タブを維持する）
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
          // エスケープされたダブルクォーテーション
          field += '"';
          i++; // 次のダブルクォーテーションをスキップ
        } else {
          // クォート終了
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        // クォート開始
        inQuotes = true;
      } else if (char === '\t') {
        // フィールド区切り
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

  // 最後のフィールドと行を処理
  if (field !== '' || row.length > 0) {
    row.push(field);
    result.push(row);
  }

  // 全てのセルが空の行をフィルタリングし、セル値をトリム
  return result
    .map(r => r.map(cell => cell.trim()))
    .filter(r => r.some(cell => cell !== ''));
};

export const PasteImportModal: React.FC<PasteImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  userEmail,
}) => {
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [parsedRows, setParsedRows] = useState<string[][]>(createEmptyGrid());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);

  // 物件マスタ突合用の状態
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [autoCorrectConfig, setAutoCorrectConfig] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setParsedRows(createEmptyGrid());
      setPreviewItems([]);
      setValidationResults([]);
      setAutoCorrectConfig({});
      setValidationErrors([]);
      setActiveCell(null);
    } else {
      const fetchStaffs = async () => {
        try {
          const { data, error } = await supabase.from('staff').select('*');
          if (error) throw error;
          setStaffList(data || []);
        } catch (err) {
          console.error('Failed to fetch staff list:', err);
        }
      };
      fetchStaffs();
    }
  }, [isOpen]);

  // グリッド上でのコピペ (Ctrl+V) 処理
  const handleGridPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('text/plain');
    if (!clipboardData) return;

    const pasteRows = parseTSV(clipboardData);
    if (pasteRows.length === 0) return;

    const colCount = pasteRows[0].length;
    
    // 起点となるセル（アクティブセルがあればそれ、なければ 0, 0）
    const startRow = activeCell ? activeCell.row : 0;
    const startCol = activeCell ? activeCell.col : 0;

    const nextRows = parsedRows.map(row => [...row]);

    // 従来通り、一番左端 (col 0) 起点で、貼り付けデータがちょうど8列の場合は
    // 旧システムのコピペ仕様（BOX, 物件名, 種別, 作業内容...）に自動マッピングする
    if (startCol === 0 && colCount === 8) {
      pasteRows.forEach((row, rOffset) => {
        const targetRowIdx = startRow + rOffset;
        
        while (nextRows.length <= targetRowIdx) {
          nextRows.push(Array(10).fill(''));
        }

        const mappedRow = Array(10).fill('');
        mappedRow[1] = row[0] || ''; // BOX (列2)
        mappedRow[3] = row[1] || ''; // 物件名 (列4)
        mappedRow[4] = row[2] || ''; // 種別 (列5)
        mappedRow[5] = row[3] || ''; // 作業内容 (列6)
        mappedRow[6] = row[4] || ''; // 時間 (列7)
        mappedRow[7] = row[5] || ''; // 対応者 (列8)
        mappedRow[8] = row[6] || ''; // エリア (列9)
        mappedRow[9] = row[7] || ''; // 県別 (列10)

        // 既存のセルを上書き（貼り付け範囲のみ）
        for (let i = 0; i < 10; i++) {
          nextRows[targetRowIdx][i] = mappedRow[i];
        }
      });
    } else {
      // それ以外の場合は、アクティブセルを左上起点として、単純にデータを流し込む
      pasteRows.forEach((row, rOffset) => {
        const targetRowIdx = startRow + rOffset;
        
        // 必要に応じて行数を自動拡張
        while (nextRows.length <= targetRowIdx) {
          nextRows.push(Array(10).fill(''));
        }

        row.forEach((value, cOffset) => {
          const targetColIdx = startCol + cOffset;
          if (targetColIdx < 10) {
            nextRows[targetRowIdx][targetColIdx] = value || '';
          }
        });
      });
    }

    setParsedRows(nextRows);
  };

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    const nextRows = parsedRows.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIdx && cIdx === colIdx ? value : cell))
    );
    setParsedRows(nextRows);
  };

  const handleAddRow = () => {
    const newRow = Array(10).fill('');
    setParsedRows([...parsedRows, newRow]);
  };

  const handleDeleteRow = (rowIdx: number) => {
    const nextRows = parsedRows.filter((_, idx) => idx !== rowIdx);
    if (nextRows.length === 0) {
      setParsedRows([Array(10).fill('')]);
    } else {
      setParsedRows(nextRows);
    }
  };

  const handleClearGrid = () => {
    setParsedRows(createEmptyGrid());
  };

  // 1. バックエンドにデータを送信してマスタと突合する（非同期バリデーション）
  useEffect(() => {
    const isGridEmpty = parsedRows.every(row => row.every(cell => !cell || cell.trim() === ''));
    if (isGridEmpty) {
      setPreviewItems([]);
      setValidationResults([]);
      setValidationErrors([]);
      return;
    }

    const itemsToValidate: any[] = [];
    const validRowIndices: number[] = [];

    parsedRows.forEach((row, rowIdx) => {
      if (row.every(cell => !cell || cell.trim() === '')) return;
      
      const item: any = {};
      FIXED_MAPPINGS.forEach((field, colIdx) => {
        item[field] = row[colIdx] ? row[colIdx].trim() : '';
      });
      item.date = targetDate;
      itemsToValidate.push(item);
      validRowIndices.push(rowIdx);
    });

    if (itemsToValidate.length === 0) {
      setPreviewItems([]);
      setValidationResults([]);
      setValidationErrors([]);
      return;
    }

    const validateData = async () => {
      try {
        const unitNumbers = itemsToValidate.map(item => item.unit_number ? String(item.unit_number).trim() : '').filter(Boolean);
        const propertyNames = itemsToValidate.map(item => item.property_name ? String(item.property_name).trim() : '').filter(Boolean);

        let exactOrUnitMatches: any[] = [];
        let nameMatches: any[] = [];

        if (unitNumbers.length > 0) {
          const { data } = await supabase
            .from('properties')
            .select('*')
            .in('unit_number', unitNumbers);
          exactOrUnitMatches = data || [];
        }
        if (propertyNames.length > 0) {
          const { data } = await supabase
            .from('properties')
            .select('*')
            .in('property_name', propertyNames);
          nameMatches = data || [];
        }

        const results = itemsToValidate.map(item => {
          const unitNumber = item.unit_number ? String(item.unit_number).trim() : '';
          const propertyName = item.property_name ? String(item.property_name).trim() : '';

          let status = 'not_found';
          let masterData = null;

          if (unitNumber !== '' && propertyName !== '') {
            const exactMatch = exactOrUnitMatches.find(p => p.unit_number === unitNumber && p.property_name === propertyName);
            if (exactMatch) {
              status = 'match';
              masterData = exactMatch;
            } else {
              const unitMatch = exactOrUnitMatches.find(p => p.unit_number === unitNumber);
              if (unitMatch) {
                status = 'name_mismatch';
                masterData = unitMatch;
              } else {
                const nameMatch = nameMatches.find(p => p.property_name === propertyName);
                if (nameMatch) {
                  status = 'unit_number_mismatch';
                  masterData = nameMatch;
                }
              }
            }
          } else if (unitNumber !== '') {
            const unitMatch = exactOrUnitMatches.find(p => p.unit_number === unitNumber);
            if (unitMatch) {
              status = 'name_mismatch';
              masterData = unitMatch;
            }
          } else if (propertyName !== '') {
            const nameMatch = nameMatches.find(p => p.property_name === propertyName);
            if (nameMatch) {
              status = 'unit_number_mismatch';
              masterData = nameMatch;
            }
          }

          return {
            original_data: item,
            status,
            master_data: masterData
          };
        });

        setValidationResults(results);

        // デフォルトで自動補正をすべてONにする
        const initialConfig: Record<number, boolean> = {};
        results.forEach((_: any, idx: number) => {
          const rowIdx = validRowIndices[idx];
          initialConfig[rowIdx] = true;
        });
        setAutoCorrectConfig(prev => ({ ...initialConfig, ...prev }));
      } catch (err) {
        console.error('Failed to validate import data:', err);
      }
    };

    validateData();
  }, [parsedRows, targetDate]);

  // 2. 突合結果と自動補正設定をマージして、最終プレビューとエラーの一覧を計算する
  useEffect(() => {
    if (validationResults.length === 0) {
      setPreviewItems([]);
      setValidationErrors([]);
      return;
    }

    const finalItems: any[] = [];
    const errors: string[] = [];
    const nonEntityRows = parsedRows.map((r, i) => r.every(cell => !cell || cell.trim() === '') ? -1 : i).filter(i => i !== -1);

    validationResults.forEach((resItem: any, idx: number) => {
      const original = { ...resItem.original_data };
      const status = resItem.status;
      const master = resItem.master_data;
      const rowIdx = nonEntityRows[idx];
      const actualRowNumber = rowIdx + 1;

      const shouldCorrect = autoCorrectConfig[rowIdx] !== false;

      let finalItem = { ...original, status: 'confirmed' };

      // スタッフの曖昧一致解決
      const rawStaffName = finalItem.staff_name ? finalItem.staff_name.trim() : '';
      let resolvedStaff: Staff | undefined = undefined;
      if (rawStaffName) {
        resolvedStaff = findStaffByName(staffList, rawStaffName);
        if (resolvedStaff) {
          finalItem.staff_id = resolvedStaff.id;
          finalItem.staff_name = resolvedStaff.name; // マスタの正式名称に上書き
        }
      }

      // 自動補正が有効な場合、マスタ情報で上書き
      if (master && shouldCorrect) {
        if (status === 'name_mismatch' || status === 'unit_number_mismatch') {
          finalItem.unit_number = master.unit_number || finalItem.unit_number;
          finalItem.property_name = master.property_name || finalItem.property_name;
          finalItem.box = master.box_count ? String(master.box_count) : finalItem.box;
          finalItem.type = master.model_type || finalItem.type;
          
          if (master.address) {
            const { prefecture, area } = resolveAddress(master.address);
            if (prefecture) finalItem.prefecture = prefecture;
            if (area) finalItem.area = area;
          }
        }
      }

      // コース番号の自動決定ルール
      const workType = finalItem.work_type ? finalItem.work_type.trim() : '';
      if (workType === '設置') {
        finalItem.course = '100';
      } else if (workType === '委託') {
        finalItem.course = '121';
      } else {
        if (resolvedStaff && resolvedStaff.default_course) {
          finalItem.course = resolvedStaff.default_course;
        } else {
          finalItem.course = original.course || '';
        }
      }

      // 決定したコース番号に基づいて、区分（division）を自動決定
      const courseStr = String(finalItem.course).trim();
      const courseNum = Number(courseStr);
      if (courseStr !== '' && !isNaN(courseNum) && courseNum >= 1 && courseNum <= 26) {
        finalItem.division = 'FTS';
      } else {
        finalItem.division = '委託';
      }

      if (!finalItem.property_name) {
        errors.push(`行 ${actualRowNumber}: 物件名が空欄です。`);
      } else {
        finalItems.push(finalItem);
      }
    });

    setPreviewItems(finalItems);
    setValidationErrors(errors);
  }, [validationResults, autoCorrectConfig, parsedRows, staffList]);

  // インポート処理の実行
  const handleImport = async () => {
    if (previewItems.length === 0) return;

    setIsSubmitting(true);
    try {
      const results: { id: number; action: string }[] = [];
      const nowTime = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });

      for (const item of previewItems) {
        const {
          id, status, division, type, box, unit_number, property_name, work_type, description, 
          target_time, date, staff_id, staff_name, area, prefecture, transport, co_worker, 
          request_number, time_limit, course, result, notes, disorder_type, level, level_3,
          is_transferred
        } = item;

        if (!property_name || !date) {
          continue;
        }

        // 1. 手動入力された対応者名からスタッフIDを解決・新規登録
        let finalStaffId = staff_id ? Number(staff_id) : null;
        let finalStaffName = staff_name ? staff_name.trim() : '';

        if (!finalStaffId && finalStaffName !== '') {
          const cVal = course ? String(course).trim() : '';
          const matched = findStaffByName(staffList, finalStaffName);

          if (matched) {
            finalStaffId = matched.id;
            finalStaffName = matched.name;
            if (cVal !== '' && !matched.default_course) {
              await supabase.from('staff').update({ default_course: cVal }).eq('id', matched.id);
            }
          } else {
            const { data: newStaff, error: insertError } = await supabase
              .from('staff')
              .insert([
                { name: finalStaffName, default_course: cVal !== '' ? cVal : null }
              ])
              .select('id')
              .single();

            if (insertError) {
              throw new Error('スタッフの新規登録に失敗しました。');
            }
            finalStaffId = Number(newStaff.id);
          }
        }

        // 2. 重複チェック
        let existingSchedule = null;
        if (id) {
          const { data: sById } = await supabase.from('schedules').select('*').eq('id', Number(id)).maybeSingle();
          existingSchedule = sById;
        } else {
          let query = supabase
            .from('schedules')
            .select('*')
            .eq('date', date)
            .eq('property_name', property_name);

          if (finalStaffId) {
            query = query.eq('staff_id', finalStaffId);
          } else {
            query = query.is('staff_id', null);
          }
          
          const { data: sByMatch } = await query.maybeSingle();
          existingSchedule = sByMatch;
        }

        // 3. Upsert
        if (existingSchedule) {
          let finalCompletedAt = existingSchedule.completed_at;
          if (result !== undefined) {
            if (result === '完了') {
              if (existingSchedule.result !== '完了' || !existingSchedule.completed_at) {
                finalCompletedAt = nowTime;
              }
            } else {
              finalCompletedAt = null;
            }
          }

          const updatePayload = {
            status: status || 'confirmed',
            division: division || null,
            type: type || null,
            box: box || null,
            unit_number: unit_number || null,
            work_type: work_type || null,
            description: description || null,
            target_time: target_time || null,
            staff_id: finalStaffId,
            staff_name: finalStaffName || null,
            area: area || null,
            prefecture: prefecture || null,
            transport: transport || null,
            co_worker: co_worker || null,
            request_number: request_number || null,
            time_limit: time_limit || null,
            course: course || null,
            result: result || null,
            completed_at: finalCompletedAt,
            notes: notes || null,
            disorder_type: disorder_type || null,
            level: level || null,
            level_3: level_3 || null,
            is_transferred: is_transferred !== undefined ? Number(is_transferred) : Number(existingSchedule.is_transferred),
            updated_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase.from('schedules').update(updatePayload).eq('id', Number(existingSchedule.id));
          if (updateError) throw updateError;
          results.push({ id: Number(existingSchedule.id), action: 'updated' });
        } else {
          let finalCompletedAt = null;
          if (result === '完了') {
            finalCompletedAt = nowTime;
          }

          const insertPayload = {
            status: status || 'confirmed',
            division: division || null,
            type: type || null,
            box: box || null,
            unit_number: unit_number || null,
            property_name: property_name,
            work_type: work_type || null,
            description: description || null,
            target_time: target_time || null,
            date: date,
            staff_id: finalStaffId,
            staff_name: finalStaffName || null,
            area: area || null,
            prefecture: prefecture || null,
            transport: transport || null,
            co_worker: co_worker || null,
            request_number: request_number || null,
            time_limit: time_limit || null,
            course: course || null,
            result: result || null,
            completed_at: finalCompletedAt,
            notes: notes || null,
            disorder_type: disorder_type || null,
            level: level || null,
            level_3: level_3 || null,
            is_transferred: is_transferred !== undefined ? Number(is_transferred) : 0
          };

          const { data: newSched, error: insertError } = await supabase.from('schedules').insert([insertPayload]).select('id').single();
          if (insertError) throw insertError;
          results.push({ id: Number(newSched.id), action: 'created' });
        }
      }

      // 監査ログの保存
      const totalCount = results.length;
      const createdCount = results.filter(r => r.action === 'created').length;
      const updatedCount = results.filter(r => r.action === 'updated').length;

      await supabase.from('audit_logs').insert([
        {
          action: 'INSERT',
          changed_by: userEmail || 'system',
          details: `スプレッドシートから予定を一括インポートしました。(合計: ${totalCount}件, 新規: ${createdCount}件, 更新: ${updatedCount}件)`
        }
      ]);

      onImportSuccess();
      onClose();
    } catch (err: any) {
      alert(`エラーが発生しました: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // グリッドにデータが含まれているかの判定
  const isGridActive = parsedRows.some(row => row.some(cell => cell && cell.trim() !== ''));

  return (
    <div className="modal-backdrop">
      <div className="import-modal-content card">
        <div className="import-modal-header">
          <div className="title-icon-group">
            <FileText className="text-primary" size={24} />
            <h3>スプレッドシートから予定を一括貼り付け</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="import-modal-body-split">
          {/* 左ペイン: スプレッドシート風編集グリッド */}
          <div className="split-left-pane">
            <div className="pane-header-split">
              <div className="pane-title-area">
                <h4>スプレッドシート風入力グリッド (10列固定枠)</h4>
                <p className="helper-text">
                  セルを選択して `Ctrl+V` で予定表データを丸ごと貼り付けるか、セル内を直接クリックして入力・編集してください。
                </p>
              </div>
              <div className="grid-action-buttons">
                <button className="btn btn-secondary btn-sm" onClick={handleAddRow}>
                  <Plus size={14} /> 行を追加
                </button>
                <button className="btn btn-danger-outline btn-sm" onClick={handleClearGrid} disabled={!isGridActive}>
                  クリア
                </button>
              </div>
            </div>

            <div className="spreadsheet-grid-container" onPaste={handleGridPaste}>
              <table className="spreadsheet-table">
                <thead>
                  <tr>
                    <th className="row-num-header">#</th>
                    {FIXED_MAPPINGS.map((field, idx) => (
                      <th key={idx} className="col-mapping-header">
                        <div className="header-cell-content-fixed">
                          <span className="col-tag">列 {idx + 1}</span>
                          <span className="col-label-fixed">{FIELD_LABELS[field]}</span>
                        </div>
                      </th>
                    ))}
                    <th className="row-delete-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="row-num-cell">
                        {rowIdx + 1}
                      </td>
                      {row.map((cellValue, colIdx) => (
                        <td key={colIdx} className="grid-input-cell">
                          <input
                            type="text"
                            className="cell-input"
                            value={cellValue}
                            onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                            onFocus={() => setActiveCell({ row: rowIdx, col: colIdx })}
                          />
                        </td>
                      ))}
                      <td className="row-delete-cell">
                        <button className="delete-row-btn" onClick={() => handleDeleteRow(rowIdx)} title="行を削除">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 右ペイン: 最終検証 & 登録プレビュー */}
          <div className="split-right-pane">
            {!isGridActive ? (
              <div className="empty-preview-placeholder">
                <FileText size={48} className="placeholder-icon" />
                <p>グリッドにデータを入力または貼り付けてください。</p>
                <p className="placeholder-sub">貼り付けると、こちらにカレンダー登録用の最終プレビューが自動で生成されます。</p>
              </div>
            ) : (
              <div className="import-config-container">
                {/* ツールバー設定 */}
                <div className="config-toolbar-split">
                  {/* インポート予定日付 */}
                  <div className="inline-date-selector">
                    <span className="label-text">インポート日付:</span>
                    <input
                      type="date"
                      className="date-input-sm"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* データプレビューとエラー */}
                <div className="preview-validation-section">
                  <h4>登録予定プレビュー ({previewItems.length} 件)</h4>
                  
                  {validationErrors.length > 0 && (
                    <div className="error-alert-box">
                      <div className="alert-title">
                        <AlertTriangle size={16} />
                        <span>エラーがあります。問題のある行は除外して取り込まれます。</span>
                      </div>
                      <ul className="error-list">
                        {validationErrors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {validationErrors.length > 5 && (
                          <li className="more-errors">他 {validationErrors.length - 5} 件のエラーがあります。</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="preview-table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="preview-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>行</th>
                          <th style={{ width: '100px' }}>マスタ照合</th>
                          <th style={{ width: '90px' }}>号機</th>
                          <th style={{ width: '180px' }}>物件名</th>
                          <th style={{ width: '70px', textAlign: 'center' }}>補正</th>
                          <th style={{ width: '90px' }}>エリア</th>
                          <th style={{ width: '80px' }}>対応者</th>
                          <th style={{ width: '120px' }}>作業内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResults.map((resItem: any, idx: number) => {
                          const original = resItem.original_data;
                          const status = resItem.status;
                          const master = resItem.master_data;

                          const nonEntityRows = parsedRows.map((r, i) => r.every(cell => !cell || cell.trim() === '') ? -1 : i).filter(i => i !== -1);
                          const rowIdx = nonEntityRows[idx];
                          const actualRowNumber = rowIdx + 1;

                          const shouldCorrect = autoCorrectConfig[rowIdx] !== false;

                          let statusBadge = null;
                          if (status === 'match') {
                            statusBadge = <span className="badge-match" style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>マスタ一致</span>;
                          } else if (status === 'name_mismatch') {
                            statusBadge = <span className="badge-mismatch" style={{ color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>物件名ズレ</span>;
                          } else if (status === 'unit_number_mismatch') {
                            statusBadge = <span className="badge-mismatch" style={{ color: '#2563eb', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>号機ズレ</span>;
                          } else {
                            statusBadge = <span className="badge-notfound" style={{ color: '#4b5563', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>マスタ未登録</span>;
                          }

                          const toggleCorrect = () => {
                            setAutoCorrectConfig(prev => ({
                              ...prev,
                              [rowIdx]: !shouldCorrect
                            }));
                          };

                          let unitDisplay = <span>{original.unit_number || '空欄'}</span>;
                          if (status === 'unit_number_mismatch' && master && shouldCorrect) {
                            unitDisplay = (
                              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
                                <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{original.unit_number || '空欄'}</span>
                                <span style={{ color: '#2563eb', fontWeight: 'bold' }}>➔ {master.unit_number}</span>
                              </div>
                            );
                          }

                          let propertyDisplay = <span>{original.property_name || '空欄'}</span>;
                          if (status === 'name_mismatch' && master && shouldCorrect) {
                            propertyDisplay = (
                              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
                                <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{original.property_name}</span>
                                <span style={{ color: '#d97706', fontWeight: 'bold' }}>➔ {master.property_name}</span>
                              </div>
                            );
                          } else if (status === 'unit_number_mismatch' && master && shouldCorrect) {
                            propertyDisplay = (
                              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
                                <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{original.property_name}</span>
                                <span style={{ color: '#2563eb', fontWeight: 'bold' }}>➔ {master.property_name}</span>
                              </div>
                            );
                          }

                          const hasCorrection = status === 'name_mismatch' || status === 'unit_number_mismatch';

                          return (
                            <tr key={idx} style={{ 
                              background: hasCorrection && shouldCorrect ? 'rgba(254, 243, 199, 0.15)' : 'transparent',
                              borderBottom: '1px solid var(--border-color, #e2e8f0)'
                            }}>
                              <td style={{ textAlign: 'center', fontWeight: '500', padding: '8px 4px' }}>{actualRowNumber}</td>
                              <td style={{ padding: '8px 4px' }}>{statusBadge}</td>
                              <td style={{ padding: '8px 4px' }}>{unitDisplay}</td>
                              <td style={{ padding: '8px 4px' }}>{propertyDisplay}</td>
                              <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                                {hasCorrection ? (
                                  <input 
                                    type="checkbox" 
                                    checked={shouldCorrect}
                                    onChange={toggleCorrect}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    title="マスタの正しい情報へ自動補正してインポートします"
                                  />
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 4px' }}>{hasCorrection && shouldCorrect && master && master.address ? (
                                resolveAddress(master.address).area
                              ) : (original.area || '-')}</td>
                              <td style={{ padding: '8px 4px' }}>{original.staff_name || '-'}</td>
                              <td style={{ 
                                padding: '8px 4px',
                                fontSize: '0.75rem', 
                                maxWidth: '120px', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap' 
                              }} title={original.description}>
                                {original.description || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="import-modal-footer">
          <div className="footer-info">
            {previewItems.length > 0 && (
              <span className="import-summary-text">
                <Check size={16} className="text-success" />
                {previewItems.length} 件の予定をインポートします（重複する既存の予定は自動で上書き更新されます）。
              </span>
            )}
          </div>
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              キャンセル
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={previewItems.length === 0 || isSubmitting}
            >
              {isSubmitting ? '登録中...' : `${previewItems.length} 件を一括登録`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
