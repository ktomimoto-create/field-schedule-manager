import React, { useState, useEffect, useMemo } from 'react';
import type { Schedule, Staff, ScheduleStatus, WorkType, UserRole } from '../types';
import { X, Mail, Lock } from 'lucide-react';
import { resolveAddress } from '../utils/addressResolver';
import { supabase } from '../supabaseClient';
import { findStaffByName, getShortName, toHalfWidth, normalizeTargetTime, splitCoWorkers, canManageSchedules } from '../types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  selectedDate: string | null;
  selectedSchedule: Schedule | null;
  onSave: (scheduleData: Partial<Schedule>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  workTypes: WorkType[];
  currentUserEmail?: string;
  defaultTransferred?: number;
  lockedBy?: { userName: string; userEmail: string; startedAt: number } | null;
  currentUserRole?: UserRole;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  staff,
  selectedDate,
  selectedSchedule,
  onSave,
  onDelete,
  workTypes,
  currentUserEmail,
  defaultTransferred,
  lockedBy,
  currentUserRole,
}) => {
  // 現場作業用の種別リスト（不要な「保守」「依頼有/非認可」を除外し、フリーを含める）
  const fieldWorkTypeList = useMemo(() => {
    const defaultList = ['定期', '障害', '2次', '依頼者承認済', '工事', '設置', 'フリー'];
    const excluded = ['保守', '依頼有/非認可'];
    const masterFieldTypes = (workTypes || [])
      .filter(t => t.is_internal === 0 && !excluded.includes(t.name))
      .map(t => t.name);

    const combined = [...defaultList];
    masterFieldTypes.forEach(name => {
      if (!combined.includes(name)) {
        combined.push(name);
      }
    });
    return combined;
  }, [workTypes]);

  // 状態管理
  const [status, setStatus] = useState<ScheduleStatus>('free');
  const [division, setDivision] = useState('');
  const [type, setType] = useState('');
  const [box, setBox] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [workType, setWorkType] = useState('');
  const [description, setDescription] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [date, setDate] = useState('');
  const [staffName, setStaffName] = useState(''); // 自由入力スタッフ名用
  const [area, setArea] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [transport, setTransport] = useState('');
  const [coWorker, setCoWorker] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [course, setCourse] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [disorderType, setDisorderType] = useState('');
  const [level, setLevel] = useState('');
  const [level3, setLevel3] = useState('');
  const [isSyncCoWorker, setIsSyncCoWorker] = useState(true);
  
  // プルダウン選択時の自由入力モード管理
  const [isCustomWorkType, setIsCustomWorkType] = useState(false);
  const [isCustomStaff, setIsCustomStaff] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forceUnlocked, setForceUnlocked] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForceUnlocked(false);
    }
  }, [isOpen]);

  const isEffectiveLocked = Boolean(lockedBy) && !forceUnlocked;
  const isInputDisabled = isSubmitting || isEffectiveLocked;

  // 物件マスタ自動補完用の状態
  const [propertySuggestions, setPropertySuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  const [activeHoverId, setActiveHoverId] = useState<number | null>(null);

  // 依頼番号→FC同期データ補完用
  const [requestNumberHint, setRequestNumberHint] = useState('');
  // 自動補完時のカード強調フラッシュ用
  const [isAutofillFlashing, setIsAutofillFlashing] = useState(false);

  const triggerAutofillFlash = () => {
    setIsAutofillFlashing(true);
    setTimeout(() => setIsAutofillFlashing(false), 1100);
  };

  // 読み取りにもタイムアウトを付ける（無限ハング防止）
  const withTimeout = <T,>(p: PromiseLike<T>, ms = 15000): Promise<T> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);

  const handleUnitNumberChange = (val: string) => {
    setUnitNumber(val);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (val.trim() === '') {
      setPropertySuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .ilike('unit_number', `%${val}%`)
          .limit(10);
        if (!error && data) {
          setPropertySuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (err) {
        console.error('Failed to search properties:', err);
      }
    }, 300);

    setSearchTimeout(timeout);
  };

  /** 号機をキーに物件マスタを引き、未入力の項目だけ補完する。
   *  fallback: マスタに号機が無いときに使う FC 同期データ（物件名・住所）。
   *  戻り値: マスタ or fallback で何かしら補完できたら true */
  const autofillFromUnitNumber = async (
    val: string,
    fallback?: { property_name?: string | null; address?: string | null }
  ): Promise<boolean> => {
    // ユーザーの入力物件名が未設定、またはデフォルトの場合に自動補完を試みる
    const needsNameAutoFill = !propertyName || propertyName.trim() === '' || propertyName === '（物件名未定）';
    const needsAreaAutoFill = !area || area.trim() === '';
    const needsPrefAutoFill = !prefecture || prefecture.trim() === '';

    try {
      // Supabaseから完全一致で検索
      const { data, error } = await withTimeout(
        supabase.from('properties').select('*').eq('unit_number', val).limit(1)
      );

      if (!error && data && data.length > 0) {
        const matched = data[0];
        if (needsNameAutoFill) {
          setPropertyName(matched.property_name || '');
        }
        setBox(matched.box_count ? String(matched.box_count) : '');
        setType(matched.model_type || '');

        if (matched.address) {
          const { area: determinedArea, prefecture: determinedPref } = resolveAddress(matched.address);
          if (needsAreaAutoFill && determinedArea) {
            setArea(determinedArea);
          }
          if (needsPrefAutoFill && determinedPref) {
            setPrefecture(determinedPref);
          }
        }
        triggerAutofillFlash();
        return true;
      }
    } catch (err) {
      console.error('Failed to auto-complete property:', err);
    }

    // マスタ未登録の号機（新設物件等）: FC 同期データの物件名・住所で最低限を埋める
    if (fallback) {
      if (needsNameAutoFill && fallback.property_name) setPropertyName(fallback.property_name);
      if (fallback.address) {
        const { area: determinedArea, prefecture: determinedPref } = resolveAddress(fallback.address);
        if (needsAreaAutoFill && determinedArea) setArea(determinedArea);
        if (needsPrefAutoFill && determinedPref) setPrefecture(determinedPref);
      }
      const didFill = Boolean(fallback.property_name || fallback.address);
      if (didFill) triggerAutofillFlash();
      return didFill;
    }
    return false;
  };

  const handleUnitNumberBlur = async () => {
    // サジェストを非表示（200msの遅延を設けることでリスト項目のクリックを可能にする）
    setTimeout(() => setShowSuggestions(false), 200);

    const val = unitNumber.trim();
    if (val === '') return;
    await autofillFromUnitNumber(val);
  };

  /** 依頼番号→FC同期テーブル(fc_requests)→号機→マスタ補完 */
  const handleRequestNumberBlur = async () => {
    setRequestNumberHint('');
    const val = toHalfWidth(requestNumber).trim();
    if (val === '') return;
    if (val !== requestNumber) setRequestNumber(val);

    try {
      const { data, error } = await withTimeout(
        supabase.from('fc_requests').select('*').eq('refno', val).limit(1)
      );
      if (error) throw error;
      if (!data || data.length === 0) {
        setRequestNumberHint('FC同期にまだ無い番号です。号機を入力すると残りが補完されます');
        return;
      }
      const req = data[0];
      if (!unitNumber.trim() && req.unit_number) {
        setUnitNumber(req.unit_number);
      }
      await autofillFromUnitNumber(
        (unitNumber.trim() || req.unit_number || '').trim(),
        { property_name: req.property_name, address: req.address }
      );
    } catch (err) {
      // 補完失敗は入力の妨げにしない（保存動作には無関係）
      console.error('Failed to look up fc_requests:', err);
    }
  };

  const handleSelectProperty = (prop: any) => {
    setUnitNumber(prop.unit_number || '');
    setPropertyName(prop.property_name || '');
    setBox(prop.box_count ? String(prop.box_count) : '');
    setType(prop.model_type || '');
    
    // 区分はコース番号（course）に連動して自動入力されるため、ここでは設定しません

    if (prop.address) {
      const { area: determinedArea, prefecture: determinedPref } = resolveAddress(prop.address);
      setArea(determinedArea);
      setPrefecture(determinedPref);
    }

    triggerAutofillFlash();
    setPropertySuggestions([]);
    setShowSuggestions(false);
  };

  const handleToggleCoWorker = (name: string) => {
    const trimmedName = name.trim();
    const shortName = getShortName(trimmedName);
    // 同行者リストを分解
    const currentList = splitCoWorkers(coWorker, staff);
    
    let newList: string[];
    // 本名または苗字のいずれかでリストに含まれているか判定
    const hasItem = currentList.some(n => n === trimmedName || n === shortName || getShortName(n) === shortName);
    
    if (hasItem) {
      // 削除する（本名・苗字の両方のパターンを除外）
      newList = currentList.filter(n => n !== trimmedName && n !== shortName);
    } else {
      // 選択されていない場合は苗字を追加
      newList = [...currentList, shortName];
    }
    
    // カンマ区切りの文字列に戻す
    setCoWorker(newList.join(', '));
  };

  useEffect(() => {
    if (selectedSchedule) {
      setStatus(selectedSchedule.status || 'free');
      setDivision(selectedSchedule.division || '');
      setType(selectedSchedule.type || '');
      setBox(selectedSchedule.box || '');
      setUnitNumber(selectedSchedule.unit_number || '');
      setPropertyName(selectedSchedule.property_name || '');
      
      const curWorkType = selectedSchedule.work_type || '';
      setWorkType(curWorkType);
      if (curWorkType) {
        const isKnownWorkType = fieldWorkTypeList.includes(curWorkType);
        setIsCustomWorkType(!isKnownWorkType);
      } else {
        setIsCustomWorkType(false);
      }

      setDescription(selectedSchedule.description || '');
      setTargetTime(normalizeTargetTime(selectedSchedule.target_time || ''));
      setDate(selectedSchedule.date || selectedDate || '');
      
      const sId = selectedSchedule.staff_id;
      let curStaffName = '';
      if (sId) {
        const matched = staff.find(st => st.id === sId);
        curStaffName = matched ? matched.name : (selectedSchedule.staff_name || '');
      } else {
        curStaffName = selectedSchedule.staff_name || '';
      }
      setStaffName(curStaffName);
      if (curStaffName) {
        const isKnownStaff = staff.some(st => st.name === curStaffName);
        setIsCustomStaff(!isKnownStaff);
      } else {
        setIsCustomStaff(false);
      }

      setArea(selectedSchedule.area || '');
      setPrefecture(selectedSchedule.prefecture || '');
      setTransport(selectedSchedule.transport || '');
      setCoWorker(selectedSchedule.co_worker || '');
      setRequestNumber(selectedSchedule.request_number || '');
      setRequestNumberHint('');
      setTimeLimit(toHalfWidth(selectedSchedule.time_limit || ''));
      setCourse(selectedSchedule.course || '');
      setResult(selectedSchedule.result || '');
      const rawNotes = selectedSchedule.notes || '';
      const hasNoSync = rawNotes.includes('[__no_sync__]');
      setNotes(rawNotes.replace(/\s*\[__no_sync__\]/g, '').trim());
      setIsSyncCoWorker(!hasNoSync);
      setDisorderType(selectedSchedule.disorder_type || '');
      setLevel(selectedSchedule.level || '');
      setLevel3(selectedSchedule.level_3 || '');
    } else {
      setStatus('free');
      setDivision('委託'); // 新規追加時の初期値は「委託」
      setType('');
      setBox('');
      setUnitNumber('');
      setPropertyName('');
      setWorkType('');
      setIsCustomWorkType(false);
      setDescription('');
      setTargetTime('');
      setDate(selectedDate || new Date().toISOString().split('T')[0]);
      setStaffName('');
      setIsCustomStaff(false);
      setArea('');
      setPrefecture('');
      setTransport('');
      setCoWorker('');
      setRequestNumber('');
      setRequestNumberHint('');
      setTimeLimit('');
      setCourse('');
      setResult('');
      setNotes('');
      setIsSyncCoWorker(true);
      setDisorderType('');
      setLevel('');
      setLevel3('');
    }
  }, [selectedSchedule, selectedDate, isOpen, staff, fieldWorkTypeList]);

  // コース番号の変更に連動して、区分を自動判定してセットする
  useEffect(() => {
    if (course !== undefined && course !== null) {
      const courseStr = String(course).trim();
      const courseNum = Number(courseStr);
      if (courseStr !== '' && !isNaN(courseNum) && courseNum >= 1 && courseNum <= 26) {
        setDivision('FTS');
      } else {
        setDivision('委託');
      }
    }
  }, [course]);

  // アサインスタッフのメールアドレス検索
  const targetStaff = findStaffByName(staff, staffName);
  const targetStaffEmail = targetStaff?.email;

  const handleSendEmailNotification = async () => {
    if (!selectedSchedule || !targetStaff || !targetStaffEmail) return;

    const subject = encodeURIComponent(`【緊急】本日作業予定追加（物件名：${propertyName}）`);
    
    const bodyText = `${targetStaff.name}さん

お疲れ様です。本日急遽、以下の作業予定が追加（または変更）されました。
内容をご確認の上、ご対応をお願いいたします。

■ 日付: ${date}
■ 物件名: ${propertyName}
■ 種別: ${workType || '一般'}
■ 指定時間: ${targetTime || 'なし'}
■ 作業内容:
${description || '※作業内容の記載なし'}

■ 備考/特記指示:
${notes || 'なし'}

現地に到着しましたら、ナビタイム（当日行動予定表）のステータスを「作業中」、作業完了後は「完了」へ更新してください。`;

    const body = encodeURIComponent(bodyText);
    const mailtoUrl = `mailto:${targetStaffEmail}?subject=${subject}&body=${body}`;

    // メーラーを起動
    window.location.href = mailtoUrl;

    // バックエンドにログを記録する
    try {
      await fetch(`http://localhost:5000/api/schedules/${selectedSchedule.id}/email-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': currentUserEmail || 'system'
        },
        body: JSON.stringify({ recipient: targetStaffEmail })
      });
    } catch (err) {
      console.error('Failed to log email notification:', err);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEffectiveLocked) {
      alert(`現在、${lockedBy?.userName} さんがこの予定を編集中です。同時編集による競合を防ぐため保存できません。`);
      return;
    }
    if (!propertyName.trim() || !date) {
      alert('物件名と対応日は必須です。');
      return;
    }

    const isEdit = !!(selectedSchedule && selectedSchedule.id && !String(selectedSchedule.id).startsWith('temp-'));

    setIsSubmitting(true);
    try {
      // 入力された staffName に合致する既存スタッフを特定
      const matchedStaff = findStaffByName(staff, staffName);

      const isCancelled = status === 'cancelled';
      const payload: Partial<Schedule> = {
        status,
        division: isCancelled ? '未定' : (division.trim() || null),
        type: type.trim() || null,
        box: box.trim() || null,
        unit_number: unitNumber.trim() || null,
        property_name: propertyName.trim(),
        work_type: workType.trim() || null,
        description: description.trim() || null,
        target_time: normalizeTargetTime(targetTime.trim()) || null,
        date,
        staff_id: isCancelled ? null : (matchedStaff ? matchedStaff.id : null),
        staff_name: isCancelled ? '' : (matchedStaff ? matchedStaff.name : (staffName.trim() || undefined)),
        area: area.trim() || null,
        prefecture: prefecture.trim() || null,
        transport: transport.trim() || null,
        co_worker: coWorker.trim() || null,
        request_number: requestNumber.trim() || null,
        time_limit: toHalfWidth(timeLimit.trim()) || null,
        course: isCancelled ? '' : (course.trim() || null),
        result: result.trim() || null,
        notes: (() => {
          let finalNotes = notes.trim();
          if (!isSyncCoWorker) {
            finalNotes = finalNotes ? `${finalNotes}\n\n[__no_sync__]` : '[__no_sync__]';
          }
          return finalNotes || null;
        })(),
        disorder_type: disorderType.trim() || null,
        level: level.trim() || null,
        level_3: level3.trim() || null,
        is_transferred: isEdit && selectedSchedule ? (selectedSchedule.is_transferred ?? 0) : (defaultTransferred ?? 0)
      };

      if (isEdit && selectedSchedule) {
        payload.id = selectedSchedule.id;
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!selectedSchedule || isEffectiveLocked) return;
    if (window.confirm('この予定を削除してもよろしいですか？')) {
      setIsSubmitting(true);
      try {
        await onDelete(selectedSchedule.id as number);
        onClose();
      } catch (err) {
        console.error('Failed to delete schedule:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const isEditMode = !!(selectedSchedule && selectedSchedule.id && !String(selectedSchedule.id).startsWith('temp-'));

  return (
    <div className="schedule-sidebar-overlay" onClick={onClose}>
      <div className="schedule-sidebar-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEditMode ? '予定の編集' : '新規予定の追加'}
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', marginBottom: '1rem' }}>
          {/* 同時編集ロック警告バナー */}
          {isEffectiveLocked && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderLeft: '4px solid var(--danger, #ef4444)',
              borderTop: '1px solid rgba(239, 68, 68, 0.2)',
              borderRight: '1px solid rgba(239, 68, 68, 0.2)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '1.25rem',
              color: '#b91c1c',
              fontSize: '0.84rem',
              lineHeight: '1.4'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={18} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }} />
                <div>
                  現在、<strong>{lockedBy?.userName}</strong> さんがこの予定を編集中です。<br />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    データ競合を防ぐため保存・変更はロックされています（閲覧専用モード）。
                  </span>
                </div>
              </div>
              {canManageSchedules(currentUserRole) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (window.confirm(`${lockedBy?.userName} さんの編集ロックを強制解除しますか？\n（内容が重複保存される可能性があります）`)) {
                      setForceUnlocked(true);
                    }
                  }}
                  style={{
                    fontSize: '0.72rem',
                    padding: '4px 10px',
                    height: '28px',
                    whiteSpace: 'nowrap',
                    color: 'var(--danger, #ef4444)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    backgroundColor: '#ffffff'
                  }}
                >
                  強制ロック解除
                </button>
              )}
            </div>
          )}

          {/* ステータストグル */}
          <div className="status-toggle" style={{ marginBottom: '1.5rem', opacity: isEffectiveLocked ? 0.6 : 1, pointerEvents: isEffectiveLocked ? 'none' : 'auto' }}>
            <div 
              className={`status-toggle-btn free ${status === 'free' ? 'active' : ''}`}
              onClick={() => !isEffectiveLocked && setStatus('free')}
            >
              通常 (フリー)
            </div>
            <div 
              className={`status-toggle-btn draft ${status === 'draft' ? 'active' : ''}`}
              onClick={() => !isEffectiveLocked && setStatus('draft')}
            >
              仮予定
            </div>
            <div 
              className={`status-toggle-btn confirmed ${status === 'confirmed' ? 'active' : ''}`}
              onClick={() => !isEffectiveLocked && setStatus('confirmed')}
            >
              確定予定
            </div>
            <div 
              className={`status-toggle-btn cancelled ${status === 'cancelled' ? 'active' : ''}`}
              onClick={() => !isEffectiveLocked && setStatus('cancelled')}
              style={{ color: status === 'cancelled' ? 'var(--danger)' : 'var(--text-secondary)', backgroundColor: status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'transparent', border: status === 'cancelled' ? '1px solid rgba(239, 68, 68, 0.3)' : 'none' }}
            >
              キャンセル
            </div>
          </div>

          {/* カード 1: 案件特定・自動補完 (最上部) */}
          <div className={`schedule-modal-card card-accent-fc ${isAutofillFlashing ? 'autofill-flash' : ''}`}>
            <div className="schedule-card-header">
              <h4 className="schedule-card-title">
                <span className="card-indicator"></span>
                1. 案件特定（番号入力で下記が一瞬で自動反映）
              </h4>
              <span className="schedule-card-badge">
                ⚡ FC / 物件マスタ自動連携
              </span>
            </div>

            {/* 依頼番号 & 号機 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="request_number" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  依頼番号 <span style={{ fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 'normal' }}>(11桁)</span>
                </label>
                <input
                  type="text"
                  id="request_number"
                  className="form-control"
                  value={requestNumber}
                  onChange={(e) => { setRequestNumber(e.target.value); setRequestNumberHint(''); }}
                  onBlur={handleRequestNumberBlur}
                  placeholder="例: 26091100001"
                  autoComplete="off"
                  disabled={isInputDisabled}
                />
                {requestNumberHint && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', marginTop: '4px', lineHeight: '1.3' }}>
                    {requestNumberHint}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ position: 'relative', marginBottom: 0 }}>
                <label htmlFor="unit_number">号機</label>
                <input
                  type="text"
                  id="unit_number"
                  className="form-control"
                  value={unitNumber}
                  onChange={(e) => handleUnitNumberChange(e.target.value)}
                  onFocus={() => {
                    if (propertySuggestions.length > 0) setShowSuggestions(true);
                  }}
                  onBlur={handleUnitNumberBlur}
                  placeholder="例: 78201"
                  autoComplete="off"
                  disabled={isInputDisabled}
                />
                {showSuggestions && (
                  <ul className="property-suggestions-list" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '6px',
                    boxShadow: '0 8px 16px -2px rgba(0, 0, 0, 0.12)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '4px 0',
                    margin: '2px 0 0 0',
                    listStyle: 'none'
                  }}>
                    {propertySuggestions.map((prop) => (
                      <li
                        key={prop.id}
                        onClick={() => handleSelectProperty(prop)}
                        onMouseEnter={() => setActiveHoverId(prop.id)}
                        onMouseLeave={() => setActiveHoverId(null)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          fontSize: '0.85rem',
                          backgroundColor: activeHoverId === prop.id ? 'var(--hover-bg, #f1f5f9)' : 'transparent'
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        className="suggestion-item"
                      >
                        <div style={{ fontWeight: '600', color: 'var(--text-main, #1e293b)' }}>
                          号機: {prop.unit_number} - {prop.property_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                          住所: {prop.address} | 型式: {prop.model_type}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 物件名 */}
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label htmlFor="property_name">物件名 *</label>
              <input
                type="text"
                id="property_name"
                className="form-control"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="物件名を入力（番号入力で自動反映）"
                required
                disabled={isInputDisabled}
              />
            </div>

            {/* BOX数・タイプ・エリア・県別（4項目並列） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="box" style={{ fontSize: '0.78rem' }}>BOX数</label>
                <input
                  type="text"
                  id="box"
                  className="form-control"
                  value={box}
                  onChange={(e) => setBox(e.target.value)}
                  placeholder="例: 8"
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="type" style={{ fontSize: '0.78rem' }}>タイプ</label>
                <input
                  type="text"
                  id="type"
                  className="form-control"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="例: 標準"
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="area" style={{ fontSize: '0.78rem' }}>エリア</label>
                <input
                  type="text"
                  id="area"
                  className="form-control"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="例: 練馬区"
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="prefecture" style={{ fontSize: '0.78rem' }}>県別</label>
                <input
                  type="text"
                  id="prefecture"
                  className="form-control"
                  value={prefecture}
                  onChange={(e) => setPrefecture(e.target.value)}
                  placeholder="例: 23"
                  disabled={isInputDisabled}
                />
              </div>
            </div>
          </div>

          {/* カード 2: 配車・日程決定 */}
          <div className="schedule-modal-card">
            <div className="schedule-card-header">
              <h4 className="schedule-card-title">
                <span className="card-indicator emerald"></span>
                2. 配車・日程決定
              </h4>
            </div>

            {/* 対応予定日 & 時間（指定時間） */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="date">対応予定日 *</label>
                <input
                  type="date"
                  id="date"
                  className="form-control"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="target_time">時間（指定時間）</label>
                <input
                  type="text"
                  id="target_time"
                  className="form-control"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  onBlur={() => setTargetTime(normalizeTargetTime(targetTime))}
                  placeholder="手入力 または 下のボタン"
                  disabled={isInputDisabled}
                />
                {/* 定型チップ: 必ず・AM・PM の3つのみ (注釈文字なし) */}
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>定型:</span>
                  <button
                    type="button"
                    className={`schedule-time-chip urgent ${targetTime === '必ず' ? 'active' : ''}`}
                    onClick={() => setTargetTime('必ず')}
                    disabled={isInputDisabled}
                  >
                    必ず
                  </button>
                  <button
                    type="button"
                    className={`schedule-time-chip standard ${targetTime === 'AM' ? 'active' : ''}`}
                    onClick={() => setTargetTime('AM')}
                    disabled={isInputDisabled}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    className={`schedule-time-chip standard ${targetTime === 'PM' ? 'active' : ''}`}
                    onClick={() => setTargetTime('PM')}
                    disabled={isInputDisabled}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            {/* 対応者 & 同行者 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="staff-input">対応者</label>
                <select
                  id="staff-input"
                  className="form-control"
                  value={isCustomStaff ? '__custom__' : staffName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomStaff(true);
                      setStaffName('');
                    } else {
                      setIsCustomStaff(false);
                      setStaffName(val);
                      const matched = findStaffByName(staff, val);
                      if (matched && matched.default_course) {
                        setCourse(matched.default_course);
                      }
                    }
                  }}
                  disabled={isInputDisabled}
                >
                  <option value="">-- 未設定（フリー） --</option>
                  {staff
                    .filter((st) => st.is_active !== 0 || st.name === staffName)
                    .map((st) => (
                      <option key={st.id} value={st.name}>
                        {st.name}{st.default_course ? ` (${st.default_course}コース)` : ''}
                      </option>
                    ))}
                  <option value="__custom__">その他（自由入力）</option>
                </select>
                {isCustomStaff && (
                  <input
                    type="text"
                    className="form-control"
                    style={{ marginTop: '6px' }}
                    placeholder="担当者名を入力"
                    value={staffName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStaffName(val);
                      const matched = findStaffByName(staff, val);
                      if (matched && matched.default_course) {
                        setCourse(matched.default_course);
                      }
                    }}
                    autoFocus
                    disabled={isInputDisabled}
                  />
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="co_worker">同行者</label>
                <input
                  type="text"
                  id="co_worker"
                  className="form-control"
                  value={coWorker}
                  onChange={(e) => setCoWorker(e.target.value)}
                  disabled={isInputDisabled}
                  placeholder="佐藤, 鈴木 (下のボタンまたは手入力)"
                />
                <div className="co-worker-quick-select" style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '72px', overflowY: 'auto', padding: '2px' }}>
                  {staff
                    .filter((st) => {
                      const shortName = getShortName(st.name);
                      const isSelected = splitCoWorkers(coWorker, staff)
                        .some(val => val === st.name.trim() || val === shortName || getShortName(val) === shortName);
                      return st.is_active !== 0 || isSelected;
                    })
                    .map((st) => {
                      const shortName = getShortName(st.name);
                      const isSelected = splitCoWorkers(coWorker, staff)
                        .some(val => val === st.name.trim() || val === shortName || getShortName(val) === shortName);
                      
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => handleToggleCoWorker(st.name)}
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            borderRadius: '10px',
                            border: isSelected ? '1px solid var(--primary, #4f46e5)' : '1px solid transparent',
                            background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-empty, #f1f5f9)',
                            color: isSelected ? 'var(--primary, #4f46e5)' : 'var(--text-secondary, #475569)',
                            cursor: 'pointer',
                            fontWeight: isSelected ? '600' : 'normal',
                            transition: 'all 0.12s ease'
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{shortName}
                        </button>
                      );
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    id="sync_co_worker"
                    checked={isSyncCoWorker}
                    onChange={(e) => setIsSyncCoWorker(e.target.checked)}
                    disabled={isInputDisabled}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', margin: 0 }}
                  />
                  <label htmlFor="sync_co_worker" style={{ fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none', margin: 0, fontWeight: 'normal', color: 'var(--text-secondary, #475569)' }}>
                    相手の予定表にも自動登録する（連動登録）
                  </label>
                </div>
              </div>
            </div>

            {/* コース・区分・移動手段（配車情報を集約） */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="course" style={{ fontSize: '0.78rem' }}>コース</label>
                <input
                  type="text"
                  id="course"
                  className="form-control"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="例: 1"
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="division" style={{ fontSize: '0.78rem' }}>区分</label>
                <select
                  id="division"
                  className="form-control"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  disabled={isInputDisabled}
                >
                  <option value="委託">委託</option>
                  <option value="FTS">FTS</option>
                  <option value="未定">未定</option>
                  <option value="直行直帰">直行直帰</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="transport" style={{ fontSize: '0.78rem' }}>移動手段</label>
                <input
                  type="text"
                  id="transport"
                  className="form-control"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder="例: 車 / 電車"
                  disabled={isInputDisabled}
                />
              </div>
            </div>
          </div>

          {/* カード 3: 作業内容・TIME・備考 */}
          <div className="schedule-modal-card">
            <div className="schedule-card-header">
              <h4 className="schedule-card-title">
                <span className="card-indicator amber"></span>
                3. 作業内容・TIME・備考
              </h4>
            </div>

            {/* 種別 & TIME (目安時間) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="work_type">種別</label>
                <select
                  id="work_type"
                  className="form-control"
                  value={isCustomWorkType ? '__custom__' : (fieldWorkTypeList.includes(workType) ? workType : (workType ? '__custom__' : ''))}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomWorkType(true);
                      setWorkType('');
                    } else {
                      setIsCustomWorkType(false);
                      setWorkType(val);
                    }
                  }}
                  disabled={isInputDisabled}
                >
                  <option value="">-- 種別を選択 --</option>
                  {fieldWorkTypeList.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="__custom__">その他（自由入力）</option>
                </select>
                {isCustomWorkType && (
                  <input
                    type="text"
                    className="form-control"
                    style={{ marginTop: '6px' }}
                    placeholder="任意の種別名を入力"
                    value={workType}
                    onChange={(e) => setWorkType(e.target.value)}
                    autoFocus
                    disabled={isInputDisabled}
                  />
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="time_limit" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  TIME <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #64748b)', fontWeight: 'normal' }}>(作業目安時間)</span>
                </label>
                <input
                  type="text"
                  id="time_limit"
                  className="form-control"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  onBlur={() => setTimeLimit(toHalfWidth(timeLimit))}
                  placeholder="例: 13:00 / 13:00迄"
                  disabled={isInputDisabled}
                />
              </div>
            </div>

            {/* 作業内容 */}
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label htmlFor="description">作業内容</label>
              <textarea
                id="description"
                className="form-control"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="作業の詳細や指示内容を入力"
                disabled={isInputDisabled}
              ></textarea>
            </div>

            {/* 備考 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="notes">備考</label>
              <input
                type="text"
                id="notes"
                className="form-control"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="連絡事項・申し送り等"
                disabled={isInputDisabled}
              />
            </div>
          </div>

          {/* カード 4: 管理情報 */}
          <div className="schedule-modal-card">
            <div className="schedule-card-header">
              <h4 className="schedule-card-title">
                <span className="card-indicator slate"></span>
                4. 管理情報
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.65rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="disorder_type" style={{ fontSize: '0.78rem' }}>障害区分</label>
                <input
                  type="text"
                  id="disorder_type"
                  className="form-control"
                  value={disorderType}
                  onChange={(e) => setDisorderType(e.target.value)}
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="level" style={{ fontSize: '0.78rem' }}>level</label>
                <input
                  type="text"
                  id="level"
                  className="form-control"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  disabled={isInputDisabled}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="level3" style={{ fontSize: '0.78rem' }}>level 2</label>
                <input
                  type="text"
                  id="level3"
                  className="form-control"
                  value={level3}
                  onChange={(e) => setLevel3(e.target.value)}
                  disabled={isInputDisabled}
                />
              </div>
            </div>

            {isEditMode && (selectedSchedule?.created_by || selectedSchedule?.updated_by) && (
              <div style={{ 
                marginTop: '0.85rem', 
                paddingTop: '0.65rem', 
                borderTop: '1px dashed var(--border-color, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                fontSize: '0.72rem',
                color: 'var(--text-secondary, #64748b)'
              }}>
                {selectedSchedule.created_by && (
                  <div>
                    <span style={{ fontWeight: 600 }}>登録者:</span> {selectedSchedule.created_by} 
                    {selectedSchedule.created_at && ` (${new Date(selectedSchedule.created_at).toLocaleString('ja-JP')})`}
                  </div>
                )}
                {selectedSchedule.updated_by && (
                  <div>
                    <span style={{ fontWeight: 600 }}>最終更新者:</span> {selectedSchedule.updated_by} 
                    {selectedSchedule.updated_at && ` (${new Date(selectedSchedule.updated_at).toLocaleString('ja-JP')})`}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {isEditMode ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteClick}
                  disabled={isInputDisabled}
                >
                  この予定を削除
                </button>
              ) : (
                <div></div>
              )}

              {isEditMode && targetStaffEmail && (
                <button
                  type="button"
                  className="btn"
                  onClick={handleSendEmailNotification}
                  disabled={isSubmitting}
                  title={`${targetStaffEmail} 宛てにメールで緊急連絡`}
                  style={{ 
                    backgroundColor: 'rgba(59, 130, 246, 0.12)', 
                    color: 'var(--primary, #3b82f6)', 
                    border: '1px solid var(--border-glass, rgba(0,0,0,0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    padding: '0.5rem 1rem',
                    borderRadius: '8px'
                  }}
                >
                  <Mail size={15} /> 担当者へメール連絡
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isInputDisabled}
                title={isEffectiveLocked ? `${lockedBy?.userName} さんが編集中です` : undefined}
              >
                {isEffectiveLocked ? `🔒 編集中 (${lockedBy?.userName})` : (isSubmitting ? '保存中...' : '予定を保存')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
