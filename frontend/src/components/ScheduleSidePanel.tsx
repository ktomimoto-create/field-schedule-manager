import React, { useState, useEffect } from 'react';
import { 
  X, ChevronUp, ChevronDown, Save, Mail, CheckCircle2, 
  Trash2, Building2, User, FileText, Layers
} from 'lucide-react';
import type { Schedule, Staff, WorkType, UserRole } from '../types';
import { getShortName, splitCoWorkers } from '../types';
import { PropertyAutocomplete, type PropertyCandidate } from './PropertyAutocomplete';
import './ScheduleSidePanel.css';

interface ScheduleSidePanelProps {
  schedule: Schedule | null;
  isOpen?: boolean;
  allSchedules?: Schedule[];
  schedules?: Schedule[]; // 互換性のため両方サポート
  staff: Staff[];
  workTypes: WorkType[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  onSave: (schedule: Partial<Schedule>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onClose: () => void;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const ScheduleSidePanel: React.FC<ScheduleSidePanelProps> = ({
  schedule,
  isOpen = true,
  allSchedules = [],
  schedules = [],
  staff,
  workTypes,
  currentUserName = '担当者',
  onSave,
  onDelete,
  onClose,
  onSelectPrev,
  onSelectNext,
  hasPrev = false,
  hasNext = false
}) => {
  if (!schedule || isOpen === false) return null;

  const targetSchedulesList = schedules.length > 0 ? schedules : allSchedules;

  const [formData, setFormData] = useState<Partial<Schedule>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedMail, setCopiedMail] = useState(false);

  // スケジュール変更時にフォームデータを初期化
  useEffect(() => {
    if (schedule) {
      setFormData({
        ...schedule
      });
      setSaveSuccess(false);
      setCopiedMail(false);
    }
  }, [schedule]);

  const handleChange = (field: keyof Schedule, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 物件候補選択時の連動自動入力
  const handleSelectCandidate = (candidate: PropertyCandidate) => {
    setFormData(prev => ({
      ...prev,
      property_name: candidate.property_name,
      unit_number: candidate.unit_number || prev.unit_number,
      type: candidate.type || prev.type,
      box: candidate.box || prev.box,
      area: candidate.area || prev.area
    }));
  };

  // 同行者トグル処理
  const handleToggleCoWorker = (staffName: string) => {
    const currentList = splitCoWorkers(formData.co_worker || '', staff);
    const short = getShortName(staffName);
    let nextList: string[];
    if (currentList.some(name => getShortName(name) === short)) {
      nextList = currentList.filter(name => getShortName(name) !== short);
    } else {
      nextList = [...currentList, short];
    }
    handleChange('co_worker', nextList.join(', '));
  };

  // 担当者変更時のコース自動連動
  const handleStaffChange = (staffIdStr: string) => {
    const stId = staffIdStr ? Number(staffIdStr) : null;
    const matched = staff.find(st => st.id === stId);
    if (matched) {
      const courseVal = matched.default_course || '';
      const courseNum = Number(courseVal);
      let divVal = formData.division || '未定';
      if (courseVal !== '' && !isNaN(courseNum)) {
        divVal = (courseNum >= 1 && courseNum <= 26) ? 'FTS' : '委託';
      }
      setFormData(prev => ({
        ...prev,
        staff_id: matched.id,
        staff_name: matched.name,
        course: courseVal,
        division: divVal
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        staff_id: null,
        staff_name: '',
        course: '',
        division: '未定'
      }));
    }
  };

  // 保存実行
  const handleSave = async () => {
    if (isSaving || !schedule) return;
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        id: schedule.id
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save from side panel:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ワンクリック完了トグル
  const handleToggleComplete = async () => {
    const isCompleted = formData.result === '完了';
    const newResult = isCompleted ? '' : '完了';
    const now = new Date();
    const completedAt = isCompleted ? '' : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const updatePayload: Partial<Schedule> = {
      ...formData,
      result: newResult,
      completed_at: completedAt
    };
    setFormData(updatePayload);
    if (typeof schedule.id === 'number') {
      await onSave({
        id: schedule.id,
        result: newResult,
        completed_at: completedAt
      });
    }
  };

  // メールテンプレート生成・クリップボードコピー
  const handleCopyEmail = () => {
    const shortSender = getShortName(currentUserName);
    const unitNum = formData.unit_number || '未設定';
    const propName = formData.property_name || '未設定';
    const reqNum = formData.request_number || '未設定';
    const desc = formData.description || '未設定';

    const mailText = `件名：${unitNum}　追加

お疲れ様です。
１件追加対応願います。

【号機】${unitNum}
【物件名】${propName}

【FC依頼番号】${reqNum}
【内容】
${desc}

よろしくお願いいたします。
------------------------
ディスパッチャー：${shortSender}
`;

    navigator.clipboard.writeText(mailText).then(() => {
      setCopiedMail(true);
      setTimeout(() => setCopiedMail(false), 2500);
    });
  };

  const isCompleted = formData.result === '完了';
  const coWorkersList = splitCoWorkers(formData.co_worker || '', staff);

  return (
    <div className="schedule-side-panel">
      {/* ヘッダー */}
      <div className="schedule-side-panel-header">
        <div className="side-panel-title-area">
          <div className="side-panel-title">
            <Layers size={17} color="var(--primary, #4f46e5)" />
            <span>予定クイック編集</span>
          </div>
          <span className="side-panel-date-badge">
            {formData.date || schedule.date}
          </span>
        </div>

        <div className="side-panel-nav-actions">
          {onSelectPrev && (
            <button 
              type="button" 
              className="btn-panel-nav" 
              onClick={onSelectPrev} 
              disabled={!hasPrev}
              title="前の行を選択"
            >
              <ChevronUp size={16} />
            </button>
          )}
          {onSelectNext && (
            <button 
              type="button" 
              className="btn-panel-nav" 
              onClick={onSelectNext} 
              disabled={!hasNext}
              title="次の行を選択"
            >
              <ChevronDown size={16} />
            </button>
          )}
          <button 
            type="button" 
            className="btn-panel-close" 
            onClick={onClose}
            title="サイドバーを閉じる"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* スクロールボディ */}
      <div className="schedule-side-panel-body">
        {/* セクション1: 物件情報（オートコンプリート） */}
        <div className="side-panel-section">
          <div className="side-panel-section-title">
            <Building2 size={13} />
            <span>物件・機器情報</span>
          </div>

          <div className="side-panel-field-group">
            <label className="side-panel-field-label">物件名（自動サジェスト対応）</label>
            <PropertyAutocomplete
              value={formData.property_name || ''}
              onChange={(val) => handleChange('property_name', val)}
              onSelectCandidate={handleSelectCandidate}
              schedules={targetSchedulesList}
              placeholder="物件名を入力すると候補が出ます"
            />
          </div>

          <div className="side-panel-row-3">
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">号機番号</label>
              <input
                type="text"
                className="form-control"
                value={formData.unit_number || ''}
                onChange={(e) => handleChange('unit_number', e.target.value)}
                placeholder="60033"
              />
            </div>
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">タイプ</label>
              <input
                type="text"
                className="form-control"
                value={formData.type || ''}
                onChange={(e) => handleChange('type', e.target.value)}
                placeholder="FU"
              />
            </div>
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">BOX</label>
              <input
                type="text"
                className="form-control"
                value={formData.box || ''}
                onChange={(e) => handleChange('box', e.target.value)}
                placeholder="10"
              />
            </div>
          </div>
        </div>

        {/* セクション2: 作業内容・時間 */}
        <div className="side-panel-section">
          <div className="side-panel-section-title">
            <FileText size={13} />
            <span>作業内容・指定時間</span>
          </div>

          <div className="side-panel-field-group">
            <label className="side-panel-field-label">作業内容</label>
            <textarea
              className="form-control"
              rows={3}
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="作業内容・指示・注意事項を入力"
              style={{ fontSize: '0.85rem', lineHeight: '1.4' }}
            />
          </div>

          <div className="side-panel-row-2">
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">種別</label>
              <select
                className="form-control"
                value={formData.work_type || '定期'}
                onChange={(e) => handleChange('work_type', e.target.value)}
              >
                {workTypes.map(wt => (
                  <option key={wt.id} value={wt.name}>{wt.name}</option>
                ))}
              </select>
            </div>
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">区分</label>
              <select
                className="form-control"
                value={formData.division || 'FTS'}
                onChange={(e) => handleChange('division', e.target.value)}
              >
                <option value="FTS">FTS</option>
                <option value="委託">委託</option>
                <option value="工事">工事</option>
                <option value="未定">未定</option>
              </select>
            </div>
          </div>

          <div className="side-panel-field-group">
            <label className="side-panel-field-label">指定時間</label>
            <input
              type="text"
              className="form-control"
              value={formData.target_time || ''}
              onChange={(e) => handleChange('target_time', e.target.value)}
              placeholder="AM, PM, 必ず, 10:00 等"
            />
            <div className="time-preset-chips">
              {['AM', 'PM', '必ず', '10:00', '11:00', '14:00', '17:00迄'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  className="time-preset-chip"
                  onClick={() => handleChange('target_time', preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* セクション3: 担当者・同行者 */}
        <div className="side-panel-section">
          <div className="side-panel-section-title">
            <User size={13} />
            <span>対応スタッフ</span>
          </div>

          <div className="side-panel-row-2">
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">対応者（メイン）</label>
              <select
                className="form-control"
                value={String(formData.staff_id || '')}
                onChange={(e) => handleStaffChange(e.target.value)}
              >
                <option value="">-- 未設定 --</option>
                {staff.filter(st => st.is_active !== 0).map(st => (
                  <option key={st.id} value={st.id}>
                    {getShortName(st.name)} {st.default_course ? `(${st.default_course})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">コース番号</label>
              <input
                type="text"
                className="form-control"
                value={formData.course || ''}
                onChange={(e) => handleChange('course', e.target.value)}
                placeholder="1〜26, 90番台"
              />
            </div>
          </div>

          <div className="side-panel-field-group">
            <label className="side-panel-field-label">同行者（複数選択可）</label>
            <div className="coworkers-chips-container">
              {staff.filter(st => st.is_active !== 0).map(st => {
                const short = getShortName(st.name);
                const isSelected = coWorkersList.some(name => getShortName(name) === short);
                return (
                  <span
                    key={st.id}
                    className={`coworker-toggle-item ${isSelected ? 'checked' : ''}`}
                    onClick={() => handleToggleCoWorker(st.name)}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {short}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="side-panel-row-2">
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">エリア</label>
              <input
                type="text"
                className="form-control"
                value={formData.area || ''}
                onChange={(e) => handleChange('area', e.target.value)}
                placeholder="世田谷区"
              />
            </div>
            <div className="side-panel-field-group">
              <label className="side-panel-field-label">FC依頼番号</label>
              <input
                type="text"
                className="form-control"
                value={formData.request_number || ''}
                onChange={(e) => handleChange('request_number', e.target.value)}
                placeholder="依頼番号"
              />
            </div>
          </div>
        </div>

        {/* ワンクリック完了トグル */}
        <button
          type="button"
          className={`btn-side-panel-complete ${isCompleted ? 'completed' : ''}`}
          onClick={handleToggleComplete}
        >
          <CheckCircle2 size={16} />
          <span>{isCompleted ? '✓ 対応完了済み（クリックで未完了に戻す）' : '未対応（クリックで完了にする）'}</span>
        </button>
      </div>

      {/* フッターアクション */}
      <div className="schedule-side-panel-footer">
        <div className="side-panel-footer-actions">
          <button
            type="button"
            className="btn-side-panel-save"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={16} />
            <span>{saveSuccess ? '✓ 保存しました！' : (isSaving ? '保存中...' : '保存する')}</span>
          </button>

          <button
            type="button"
            className="btn-side-panel-mail"
            onClick={handleCopyEmail}
            title="ディスパッチャー署名入りメール文面をコピー"
          >
            <Mail size={16} />
            <span>{copiedMail ? '✓ コピー完了！' : 'メール作成'}</span>
          </button>
        </div>

        {onDelete && typeof schedule.id === 'number' && (
          <button
            type="button"
            className="btn-side-panel-delete"
            onClick={() => {
              if (window.confirm(`「${formData.property_name || 'この予定'}」を削除しますか？`)) {
                onDelete(Number(schedule.id));
                onClose();
              }
            }}
          >
            <Trash2 size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            予定を削除
          </button>
        )}
      </div>
    </div>
  );
};
