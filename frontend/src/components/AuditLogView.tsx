import React, { useState, useEffect } from 'react';
import type { AuditLog } from '../types';
import { Clock, PlusCircle, Edit, Trash2, ChevronDown, ShieldAlert, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './AuditLogView.css';

interface AuditLogViewProps {
  currentUserRole: 'admin' | 'user';
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ currentUserRole }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 50;

  const fetchLogs = async (currentOffset: number, append = false) => {
    if (currentOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(currentOffset, currentOffset + LIMIT - 1);

      if (sbError) {
        throw new Error(sbError.message || '変更履歴の取得に失敗しました。');
      }

      const logsData = (data || []) as AuditLog[];
      
      if (logsData.length < LIMIT) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (append) {
        setLogs(prev => [...prev, ...logsData]);
      } else {
        setLogs(logsData);
      }
    } catch (err: any) {
      setError(err.message || '通信エラーが発生しました。');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (currentUserRole === 'admin') {
      fetchLogs(0, false);
    }
  }, [currentUserRole]);

  const handleLoadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchLogs(nextOffset, true);
  };

  const handleRefresh = () => {
    setOffset(0);
    setHasMore(true);
    fetchLogs(0, false);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts.replace(/-/g, '/')); // SQLiteの文字列フォーマットに対応
      if (isNaN(d.getTime())) return ts;
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return ts;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return (
          <span className="log-action-badge action-insert">
            <PlusCircle size={12} />
            登録
          </span>
        );
      case 'UPDATE':
        return (
          <span className="log-action-badge action-update">
            <Edit size={12} />
            変更
          </span>
        );
      case 'DELETE':
        return (
          <span className="log-action-badge action-delete">
            <Trash2 size={12} />
            削除
          </span>
        );
      default:
        return <span className="log-action-badge">{action}</span>;
    }
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="audit-restricted-card card">
        <ShieldAlert size={48} className="restricted-icon" />
        <h3>アクセス権限がありません</h3>
        <p>変更履歴の閲覧は管理者ユーザーに制限されています。</p>
      </div>
    );
  }

  return (
    <div className="audit-log-container card">
      <div className="audit-log-header">
        <div className="audit-title-section">
          <h2>操作変更履歴 (監査ログ)</h2>
          <p className="helper-text">
            誰がいつ予定の登録・変更・削除を行ったかを時系列で追跡します（過去90日分保存）。
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={loading || loadingMore}>
          最新に更新
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>変更履歴を読み込み中...</p>
        </div>
      ) : error ? (
        <div className="audit-error-card">
          <AlertCircle size={36} className="text-danger" />
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh}>再試行</button>
        </div>
      ) : logs.length === 0 ? (
        <div className="audit-empty-state">
          <Clock size={48} className="placeholder-icon" />
          <p>変更履歴がありません。</p>
        </div>
      ) : (
        <div className="audit-timeline-wrapper">
          <div className="audit-timeline">
            {logs.map((log) => (
              <div key={log.id} className="audit-timeline-item">
                <div className="audit-timeline-dot"></div>
                <div className="audit-timeline-content">
                  <div className="audit-log-meta-row">
                    <span className="audit-log-time">{formatTimestamp(log.timestamp)}</span>
                    {getActionBadge(log.action)}
                    <span className="audit-log-user" title={log.changed_by}>
                      担当者: <strong>{log.changed_by}</strong>
                    </span>
                    {log.property_name && (
                      <span className="audit-log-property-badge">
                        物件: {log.property_name}
                      </span>
                    )}
                  </div>
                  <div className="audit-log-details">
                    <p>{log.details}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="audit-load-more-section">
              <button 
                className="btn btn-secondary load-more-btn" 
                onClick={handleLoadMore} 
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <span className="spinner spinner-sm"></span>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    さらに過去の履歴を表示 (残り表示)
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
