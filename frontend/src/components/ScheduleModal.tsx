import React, { useState, useEffect } from 'react';
import type { Schedule, Staff, ScheduleStatus, WorkType } from '../types';
import { X, Mail } from 'lucide-react';

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
}

// 住所から「県別」と「エリア」を自動判定するヘルパー関数
const determineAreaAndPrefecture = (address: string): { area: string; prefecture: string } => {
  if (!address) return { area: '', prefecture: '東京' };

  // 県別の抽出
  let pref = '東京';
  const prefMatch = address.match(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/);
  if (prefMatch) {
    pref = prefMatch[1].replace(/都|府|県/, '');
  }

  // 住所のクリーニング（都府県をトリム）
  const cleanAddress = address.replace(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/, '');

  let areaVal = '';

  if (pref === '東京') {
    if (cleanAddress.includes('中央区')) {
      areaVal = '中央区T';
    } else if (cleanAddress.includes('北区')) {
      areaVal = '北区T';
    } else {
      // 23区名のマッチ（中央区・北区を除く）
      const is23 = /^(千代田|港|新宿|文京|台東|墨田|江東|品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|荒川|板橋|練馬|足立|葛飾|江戸川)区/.test(cleanAddress);
      areaVal = is23 ? '23' : '都下';
    }
  } else if (pref === '神奈川') {
    if (cleanAddress.includes('西区')) {
      areaVal = '西区K';
    } else if (cleanAddress.includes('南区')) {
      areaVal = '南区K';
    } else if (cleanAddress.includes('緑区')) {
      areaVal = '緑区K';
    } else {
      const wardMatch = cleanAddress.match(/(鶴見|神奈川|中|港南|保土ケ谷|旭|磯子|金沢|港北|青葉|都筑|戸塚|栄|泉|瀬谷|川崎|幸|中原|高津|多摩|宮前|麻生)区/);
      if (wardMatch) {
        areaVal = wardMatch[0];
      }
    }
  } else if (pref === '埼玉') {
    if (cleanAddress.includes('西区')) {
      areaVal = '西区S';
    } else if (cleanAddress.includes('北区')) {
      areaVal = '北区S';
    } else if (cleanAddress.includes('中央区')) {
      areaVal = '中央区S';
    } else if (cleanAddress.includes('南区')) {
      areaVal = '南区S';
    } else if (cleanAddress.includes('緑区')) {
      areaVal = '緑区S';
    } else {
      const wardMatch = cleanAddress.match(/(大宮|見沼|桜|浦和|岩槻)区/);
      if (wardMatch) {
        areaVal = wardMatch[0];
      }
    }
  } else if (pref === '千葉') {
    if (cleanAddress.includes('中央区')) {
      areaVal = '中央区C';
    } else if (cleanAddress.includes('緑区')) {
      areaVal = '緑区C';
    } else {
      const wardMatch = cleanAddress.match(/(花見川|稲毛|若葉|美浜)区/);
      if (wardMatch) {
        areaVal = wardMatch[0];
      }
    }
  }

  // 上記のいずれにも該当しない場合は、従来の「市区町村名」を抽出するロジック
  if (!areaVal) {
    const match = cleanAddress.match(/^([^区市町村]+[区市町村])/);
    areaVal = match ? match[1] : cleanAddress;
  }

  return { area: areaVal, prefecture: pref };
};

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
}) => {
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
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 物件マスタ自動補完用の状態
  const [propertySuggestions, setPropertySuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  const [activeHoverId, setActiveHoverId] = useState<number | null>(null);

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
        const res = await fetch(`http://localhost:5000/api/properties/search?q=${encodeURIComponent(val)}`);
        if (res.ok) {
          const data = await res.json();
          setPropertySuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (err) {
        console.error('Failed to search properties:', err);
      }
    }, 300);

    setSearchTimeout(timeout);
  };

  const handleSelectProperty = (prop: any) => {
    setUnitNumber(prop.unit_number || '');
    setPropertyName(prop.property_name || '');
    setBox(prop.box_count ? String(prop.box_count) : '');
    setType(prop.model_type || '');
    
    // 区分はコース番号（course）に連動して自動入力されるため、ここでは設定しません

    if (prop.address) {
      const { area: determinedArea, prefecture: determinedPref } = determineAreaAndPrefecture(prop.address);
      setArea(determinedArea);
      setPrefecture(determinedPref);
    }

    setPropertySuggestions([]);
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (selectedSchedule) {
      setStatus(selectedSchedule.status || 'free');
      setDivision(selectedSchedule.division || '');
      setType(selectedSchedule.type || '');
      setBox(selectedSchedule.box || '');
      setUnitNumber(selectedSchedule.unit_number || '');
      setPropertyName(selectedSchedule.property_name || '');
      setWorkType(selectedSchedule.work_type || '');
      setDescription(selectedSchedule.description || '');
      setTargetTime(selectedSchedule.target_time || '');
      setDate(selectedSchedule.date || selectedDate || '');
      
      const sId = selectedSchedule.staff_id;
      if (sId) {
        const matched = staff.find(st => st.id === sId);
        setStaffName(matched ? matched.name : (selectedSchedule.staff_name || ''));
      } else {
        setStaffName(selectedSchedule.staff_name || '');
      }

      setArea(selectedSchedule.area || '');
      setPrefecture(selectedSchedule.prefecture || '');
      setTransport(selectedSchedule.transport || '');
      setCoWorker(selectedSchedule.co_worker || '');
      setRequestNumber(selectedSchedule.request_number || '');
      setTimeLimit(selectedSchedule.time_limit || '');
      setCourse(selectedSchedule.course || '');
      setResult(selectedSchedule.result || '');
      setNotes(selectedSchedule.notes || '');
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
      setDescription('');
      setTargetTime('');
      setDate(selectedDate || new Date().toISOString().split('T')[0]);
      setStaffName('');
      setArea('');
      setPrefecture('');
      setTransport('');
      setCoWorker('');
      setRequestNumber('');
      setTimeLimit('');
      setCourse('');
      setResult('');
      setNotes('');
      setDisorderType('');
      setLevel('');
      setLevel3('');
    }
  }, [selectedSchedule, selectedDate, isOpen, staff]);

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
  const targetStaff = staff.find(st => st.name.trim() === staffName.trim());
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
    if (!propertyName.trim() || !date) {
      alert('物件名と対応日は必須です。');
      return;
    }

    const isEdit = !!(selectedSchedule && selectedSchedule.id && !String(selectedSchedule.id).startsWith('temp-'));

    setIsSubmitting(true);
    try {
      // 入力された staffName に合致する既存スタッフを特定
      const matchedStaff = staff.find(st => st.name.trim() === staffName.trim());

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
        target_time: targetTime.trim() || null,
        date,
        staff_id: isCancelled ? null : (matchedStaff ? matchedStaff.id : null),
        staff_name: isCancelled ? '' : (matchedStaff ? matchedStaff.name : (staffName.trim() || undefined)),
        area: area.trim() || null,
        prefecture: prefecture.trim() || null,
        transport: transport.trim() || null,
        co_worker: coWorker.trim() || null,
        request_number: requestNumber.trim() || null,
        time_limit: timeLimit.trim() || null,
        course: isCancelled ? '' : (course.trim() || null),
        result: result.trim() || null,
        notes: notes.trim() || null,
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
    if (!selectedSchedule) return;
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
          {/* ステータストグル */}
          <div className="status-toggle" style={{ marginBottom: '1.5rem' }}>
            <div 
              className={`status-toggle-btn free ${status === 'free' ? 'active' : ''}`}
              onClick={() => setStatus('free')}
            >
              通常 (フリー)
            </div>
            <div 
              className={`status-toggle-btn draft ${status === 'draft' ? 'active' : ''}`}
              onClick={() => setStatus('draft')}
            >
              仮予定
            </div>
            <div 
              className={`status-toggle-btn confirmed ${status === 'confirmed' ? 'active' : ''}`}
              onClick={() => setStatus('confirmed')}
            >
              確定予定
            </div>
            <div 
              className={`status-toggle-btn cancelled ${status === 'cancelled' ? 'active' : ''}`}
              onClick={() => setStatus('cancelled')}
              style={{ color: status === 'cancelled' ? 'var(--danger)' : 'var(--text-secondary)', backgroundColor: status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'transparent', border: status === 'cancelled' ? '1px solid rgba(239, 68, 68, 0.3)' : 'none' }}
            >
              キャンセル
            </div>
          </div>

          {/* セクション 1: 日程と時間（最上部へ） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label htmlFor="date">対応予定日 *</label>
              <input
                type="date"
                id="date"
                className="form-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="target_time">時間</label>
              <input
                type="text"
                id="target_time"
                className="form-control"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                list="time-suggestions"
                disabled={isSubmitting}
              />
              <datalist id="time-suggestions">
                <option value="必ず" />
                <option value="AM" />
                <option value="PM" />
                <option value="12:00" />
                <option value="14:00迄" />
                <option value="17:00まで" />
              </datalist>
            </div>
          </div>

          {/* セクション 2: 物件・機器の特定情報 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ position: 'relative' }}>
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
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                autoComplete="off"
                disabled={isSubmitting}
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
                  borderRadius: '4px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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
            <div className="form-group">
              <label htmlFor="property_name">物件名 *</label>
              <input
                type="text"
                id="property_name"
                className="form-control"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="box">ボックス数</label>
              <input
                type="text"
                id="box"
                className="form-control"
                value={box}
                onChange={(e) => setBox(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* セクション 3: 物件詳細・種別・タイプ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label htmlFor="work_type">種別</label>
              <input
                type="text"
                id="work_type"
                className="form-control"
                value={workType}
                onChange={(e) => {
                  const val = e.target.value;
                  setWorkType(val);
                  if (val === '休暇') {
                    setPropertyName('（休暇）');
                  } else if (propertyName === '（休暇）') {
                    setPropertyName('');
                  }
                }}
                list="work-type-suggestions"
                disabled={isSubmitting}
              />
              <datalist id="work-type-suggestions">
                {workTypes.map(t => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="type">タイプ</label>
              <input
                type="text"
                id="type"
                className="form-control"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* セクション 4: 担当アサイン */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label htmlFor="staff-input">対応者</label>
              <input
                type="text"
                id="staff-input"
                className="form-control"
                value={staffName}
                onChange={(e) => {
                  const val = e.target.value;
                  setStaffName(val);
                  const matched = staff.find(st => st.name.trim() === val.trim());
                  if (matched && matched.default_course) {
                    setCourse(matched.default_course);
                  }
                }}
                list="staff-options"
                disabled={isSubmitting}
              />
              <datalist id="staff-options">
                {staff.map((st) => (
                  <option key={st.id} value={st.name} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="co_worker">同行者</label>
              <input
                type="text"
                id="co_worker"
                className="form-control"
                value={coWorker}
                onChange={(e) => setCoWorker(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* セクション 5: 作業内容・備考 */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="description">作業内容</label>
            <textarea
              id="description"
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            ></textarea>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="notes">備考</label>
            <input
              type="text"
              id="notes"
              className="form-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* 補助情報セクション */}
          <div style={{ 
            border: '1px solid var(--border-color, #e2e8f0)', 
            borderRadius: '8px', 
            padding: '1.25rem', 
            backgroundColor: 'rgba(0, 0, 0, 0.01)', 
            marginBottom: '1.5rem' 
          }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.75rem', marginTop: 0 }}>
              補助情報
            </h4>
            
            {/* エリア / 県別 / 移動手段 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label htmlFor="area">エリア</label>
                <input
                  type="text"
                  id="area"
                  className="form-control"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="prefecture">県別</label>
                <input
                  type="text"
                  id="prefecture"
                  className="form-control"
                  value={prefecture}
                  onChange={(e) => setPrefecture(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="transport">移動手段</label>
                <input
                  type="text"
                  id="transport"
                  className="form-control"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* 依頼番号 / TIME / コース */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="request_number">依頼番号</label>
                <input
                  type="text"
                  id="request_number"
                  className="form-control"
                  value={requestNumber}
                  onChange={(e) => setRequestNumber(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="time_limit">TIME</label>
                <input
                  type="text"
                  id="time_limit"
                  className="form-control"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="course">コース</label>
                <input
                  type="text"
                  id="course"
                  className="form-control"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* 管理情報セクション */}
          <div style={{ 
            border: '1px solid var(--border-color, #e2e8f0)', 
            borderRadius: '8px', 
            padding: '1.25rem', 
            backgroundColor: 'rgba(0, 0, 0, 0.01)', 
            marginBottom: '1.5rem' 
          }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.75rem', marginTop: 0 }}>
              管理情報
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="disorder_type">障害区分</label>
                <input
                  type="text"
                  id="disorder_type"
                  className="form-control"
                  value={disorderType}
                  onChange={(e) => setDisorderType(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="level">level</label>
                <input
                  type="text"
                  id="level"
                  className="form-control"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="level3">level 2</label>
                <input
                  type="text"
                  id="level3"
                  className="form-control"
                  value={level3}
                  onChange={(e) => setLevel3(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {isEditMode ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteClick}
                  disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                予定を保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
