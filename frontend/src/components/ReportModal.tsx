import React, { useState, useEffect } from 'react';
import type { Schedule } from '../types';
import { X, Clock, FileText } from 'lucide-react';
import './ReportModal.css';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule;
  onSave: (
    scheduleId: number | string,
    result: string,
    startedAt?: string | null,
    completedAt?: string | null,
    reportNotes?: string | null
  ) => Promise<void>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onSave,
}) => {
  const [result, setResult] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (schedule) {
      setResult(schedule.result || '');
      setStartedAt(schedule.started_at || '');
      setCompletedAt(schedule.completed_at || '');
      setReportNotes(schedule.report_notes || '');
    }
  }, [schedule, isOpen]);

  if (!isOpen) return null;

  const getNowTimeStr = () => {
    return new Date().toLocaleTimeString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const handleResultChange = (newResult: string) => {
    setResult(newResult);
    if (newResult === '作業中') {
      if (!startedAt) {
        setStartedAt(getNowTimeStr());
      }
    } else if (newResult === '完了') {
      if (!startedAt) {
        setStartedAt(getNowTimeStr());
      }
      if (!completedAt) {
        setCompletedAt(getNowTimeStr());
      }
    } else if (newResult === '' || newResult === 'キャンセル') {
      // 未定・キャンセルの場合は時刻をクリアするか残すかはユーザー次第
    }
  };

  const handleAutoFillStart = () => {
    setStartedAt(getNowTimeStr());
  };

  const handleAutoFillComplete = () => {
    setCompletedAt(getNowTimeStr());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(
        schedule.id,
        result,
        startedAt || null,
        completedAt || null,
        reportNotes || null
      );
      onClose();
    } catch (err) {
      console.error('Failed to save report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div
        className="report-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="report-modal-header">
          <h3>作業対応の報告</h3>
          <button className="report-modal-close" onClick={onClose} disabled={isSubmitting}>
            <X size={24} />
          </button>
        </div>

        <div className="report-schedule-summary">
          <div className="summary-title">{schedule.property_name}</div>
          {schedule.description && (
            <div className="summary-desc">
              <strong>作業指示:</strong> {schedule.description}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* ステータス選択 (タッチフレンドリーな巨大ボタン) */}
          <div className="form-group-report">
            <label className="label-report">対応ステータス *</label>
            <div className="report-status-selector">
              <button
                type="button"
                className={`btn-status-option undefined-opt ${result === '' ? 'active' : ''}`}
                onClick={() => handleResultChange('')}
                disabled={isSubmitting}
              >
                未定
              </button>
              <button
                type="button"
                className={`btn-status-option working-opt ${result === '作業中' ? 'active' : ''}`}
                onClick={() => handleResultChange('作業中')}
                disabled={isSubmitting}
              >
                作業中
              </button>
              <button
                type="button"
                className={`btn-status-option completed-opt ${result === '完了' ? 'active' : ''}`}
                onClick={() => handleResultChange('完了')}
                disabled={isSubmitting}
              >
                完了
              </button>
              <button
                type="button"
                className={`btn-status-option cancelled-opt ${result === 'キャンセル' ? 'active' : ''}`}
                onClick={() => handleResultChange('キャンセル')}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
            </div>
          </div>

          {/* 実績時間打刻 */}
          <div className="time-row-report">
            <div className="form-group-report">
              <label className="label-report">開始時間</label>
              <div className="time-input-container">
                <input
                  type="time"
                  className="form-control-report"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn-time-autofill"
                  onClick={handleAutoFillStart}
                  disabled={isSubmitting}
                  title="現在時刻を打刻"
                >
                  <Clock size={16} /> 現在
                </button>
              </div>
            </div>

            <div className="form-group-report">
              <label className="label-report">完了時間</label>
              <div className="time-input-container">
                <input
                  type="time"
                  className="form-control-report"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn-time-autofill"
                  onClick={handleAutoFillComplete}
                  disabled={isSubmitting}
                  title="現在時刻を打刻"
                >
                  <Clock size={16} /> 現在
                </button>
              </div>
            </div>
          </div>

          {/* 報告メモ */}
          <div className="form-group-report">
            <label className="label-report">対応報告メモ</label>
            <div className="notes-textarea-container">
              <FileText className="textarea-icon" size={16} />
              <textarea
                className="form-control-report textarea-report"
                placeholder="現地での対応結果や特記事項を入力してください"
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                disabled={isSubmitting}
                rows={4}
              />
            </div>
          </div>

          {/* フッターアクション */}
          <div className="report-modal-footer">
            <button
              type="button"
              className="btn-report-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="btn-report-save"
              disabled={isSubmitting}
            >
              {isSubmitting ? '保存中...' : '報告を保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
