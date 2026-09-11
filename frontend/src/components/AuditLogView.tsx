import React, { useState, useEffect, useMemo } from 'react';
import type { AuditLog, Staff, UserRole } from '../types';
import { 
  Clock, 
  PlusCircle, 
  Edit, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert, 
  AlertCircle,
  Search,
  Calendar,
  User,
  Building2,
  FileSpreadsheet,
  Send,
  Code,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import './AuditLogView.css';

interface AuditLogViewProps {
  currentUserRole: UserRole;
  staff?: Staff[];
}

interface ParsedDetails {
  isJson: boolean;
  prefix: string;
  summaryTitle: string;
  jsonData?: Record<string, any>;
  rawJsonStr?: string;
  plainText?: string;
  statusType?: 'confirmed' | 'draft' | 'cancelled' | 'free';
  operatorName?: string;
  propertyName?: string;
  unitNumber?: string;
  tags: { label: string; value: string; icon?: string; badgeColor?: string }[];
  importStats?: { total: number; created: number; updated: number };
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ currentUserRole, staff = [] }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // 検索・絞り込みステート
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'create' | 'update' | 'status' | 'delete' | 'other'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // JSON展開アコーディオンの管理 (log.id -> boolean)
  const [expandedJsonIds, setExpandedJsonIds] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  // 日時のパース（UTC ISO文字列を正しくJSTに変換）
  const parseLogDate = (ts: string): Date | null => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  // 表示用フォーマット (YYYY/MM/DD HH:mm:ss)
  const formatTimestamp = (ts: string) => {
    const d = parseLogDate(ts);
    if (!d) return ts;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // 日付グループ用フォーマット (YYYY年M月D日(曜))
  const formatDateGroupHeader = (ts: string) => {
    const d = parseLogDate(ts);
    if (!d) return '日付不明';
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${days[d.getDay()]})`;
  };

  // 日付キー (YYYY-MM-DD)
  const getDateKey = (ts: string) => {
    const d = parseLogDate(ts);
    if (!d) return 'unknown';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // 相対時間（「5分前」「1時間前」等）
  const getRelativeTime = (ts: string) => {
    const d = parseLogDate(ts);
    if (!d) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'たった今';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays <= 7) return `${diffDays}日前`;
    return '';
  };

  // 操作者名の解決（JSON内の updated_by / created_by ＞ staffマスタ ＞ メールアドレス）
  const resolveOperatorName = (changedBy: string, jsonOperator?: string) => {
    if (jsonOperator && jsonOperator.trim()) {
      return jsonOperator.trim();
    }
    const matchedStaff = staff.find(st => st.email && st.email.toLowerCase() === changedBy.toLowerCase());
    if (matchedStaff) {
      return matchedStaff.name;
    }
    return changedBy || 'システム';
  };

  // 詳細テキストのパースと構造化
  const parseAuditDetails = (raw: string, action: string, propertyNameFallback?: string | null): ParsedDetails => {
    if (!raw) {
      return {
        isJson: false,
        prefix: '',
        summaryTitle: '操作が実行されました',
        plainText: '',
        tags: []
      };
    }

    // JSONブロックの検出
    const jsonStartIndex = raw.indexOf('{');
    if (jsonStartIndex !== -1) {
      const prefix = raw.slice(0, jsonStartIndex).replace(/[:：]\s*$/, '').trim();
      const jsonStr = raw.slice(jsonStartIndex);
      try {
        const data = JSON.parse(jsonStr);
        const tags: { label: string; value: string; icon?: string; badgeColor?: string }[] = [];

        const operatorName = data.updated_by || data.created_by;
        const propName = data.property_name || propertyNameFallback || '';
        const unitNum = data.unit_number;

        let summaryTitle = prefix || '予定を更新しました';
        let statusType: 'confirmed' | 'draft' | 'cancelled' | 'free' | undefined = undefined;

        // ステータスの特定
        if (data.status) {
          if (data.status === 'cancelled') {
            statusType = 'cancelled';
            summaryTitle = propName 
              ? `【${propName}】をステータス【キャンセル】に変更しました` 
              : '予定をステータス【キャンセル】に変更しました';
            tags.push({ label: 'ステータス', value: 'キャンセル', badgeColor: 'cancelled' });
          } else if (data.status === 'confirmed') {
            statusType = 'confirmed';
            summaryTitle = propName 
              ? `【${propName}】をステータス【確定】に変更しました` 
              : '予定をステータス【確定】に変更しました';
            tags.push({ label: 'ステータス', value: '確定', badgeColor: 'confirmed' });
          } else if (data.status === 'draft') {
            statusType = 'draft';
            summaryTitle = propName 
              ? `【${propName}】をステータス【仮】に変更しました` 
              : '予定をステータス【仮】に変更しました';
            tags.push({ label: 'ステータス', value: '仮', badgeColor: 'draft' });
          } else if (data.status === 'free') {
            statusType = 'free';
            tags.push({ label: 'ステータス', value: 'フリー', badgeColor: 'free' });
          }
        }

        // 新規作成の場合のタイトル調整
        const normAction = action.toLowerCase();
        if (normAction === 'create' || normAction === 'insert' || prefix.includes('新規作成')) {
          summaryTitle = propName 
            ? `【${propName}】の予定を新規登録しました` 
            : '予定を新規登録しました';
        } else if (!statusType && propName) {
          summaryTitle = `【${propName}】の予定内容を更新しました`;
        }

        // 主要フィールドのタグ抽出（null, undefined, 空文字, 内部IDは除外）
        if (data.date) {
          tags.push({ label: '日付', value: data.date });
        }
        if (data.unit_number) {
          tags.push({ label: '号機', value: String(data.unit_number) });
        }
        if (data.work_type && data.work_type !== 'フリー') {
          tags.push({ label: '種別', value: data.work_type });
        }
        if (data.staff_name) {
          const staffDetail = data.course ? `${data.staff_name} (コース: ${data.course}${data.division ? ` / ${data.division}` : ''})` : data.staff_name;
          tags.push({ label: '担当者', value: staffDetail });
        } else if (data.status === 'cancelled' || data.division === '未定') {
          tags.push({ label: '担当者', value: '未定（フリー枠へ退避）' });
        }
        if (data.target_time && data.target_time.trim()) {
          tags.push({ label: '時間/指定', value: data.target_time });
        }
        if (data.area && data.area.trim()) {
          tags.push({ label: 'エリア', value: data.area });
        }
        if (data.description && data.description.trim()) {
          tags.push({ label: '作業内容', value: data.description });
        }
        if (data.co_worker && data.co_worker.trim()) {
          tags.push({ label: '同行者', value: data.co_worker });
        }
        if (data.notes && data.notes.trim() && !data.notes.includes('__parent_id')) {
          tags.push({ label: '備考/メモ', value: data.notes });
        }
        if (data.result && data.result.trim()) {
          tags.push({ label: '結果', value: data.result });
        }

        return {
          isJson: true,
          prefix,
          summaryTitle,
          jsonData: data,
          rawJsonStr: jsonStr,
          statusType,
          operatorName,
          propertyName: propName,
          unitNumber: unitNum ? String(unitNum) : undefined,
          tags
        };
      } catch {
        // パース失敗時はテキストとして処理
      }
    }

    // 非JSONテキスト（一括インポート、移行、削除など）の処理
    let summaryTitle = raw;
    let importStats: { total: number; created: number; updated: number } | undefined = undefined;
    const tags: { label: string; value: string; badgeColor?: string }[] = [];

    // スプレッドシートインポートの解析
    const importMatch = raw.match(/合計:\s*(\d+)件[^\d]*新規:\s*(\d+)件[^\d]*更新:\s*(\d+)件/);
    if (importMatch) {
      const total = parseInt(importMatch[1], 10);
      const created = parseInt(importMatch[2], 10);
      const updated = parseInt(importMatch[3], 10);
      importStats = { total, created, updated };
      summaryTitle = 'スプレッドシートから予定を一括インポートしました';
      tags.push({ label: '合計件数', value: `${total}件` });
      tags.push({ label: '新規登録', value: `${created}件`, badgeColor: 'confirmed' });
      tags.push({ label: '既存更新', value: `${updated}件`, badgeColor: 'draft' });
    } else if (raw.includes('行動予定表へ移行しました')) {
      summaryTitle = raw;
    } else if (raw.includes('予定を削除しました')) {
      summaryTitle = propertyNameFallback 
        ? `【${propertyNameFallback}】の予定を削除しました` 
        : '予定を削除しました';
    } else if (raw.includes('すべてのスケジュールデータを一括削除')) {
      summaryTitle = 'すべてのスケジュールデータを一括削除しました';
    } else if (raw.includes('結果を更新しました')) {
      summaryTitle = raw;
    }

    return {
      isJson: false,
      prefix: '',
      summaryTitle,
      plainText: raw,
      tags,
      importStats
    };
  };

  // アクションバッジのレンダリング
  const renderActionBadge = (action: string, parsed: ParsedDetails) => {
    const act = (action || '').toUpperCase();

    // ステータス変更の場合の特化バッジ
    if (parsed.statusType === 'confirmed') {
      return (
        <span className="log-badge badge-confirmed">
          <CheckCircle2 size={13} />
          確定に変更
        </span>
      );
    }
    if (parsed.statusType === 'draft') {
      return (
        <span className="log-badge badge-draft">
          <Clock size={13} />
          仮に変更
        </span>
      );
    }
    if (parsed.statusType === 'cancelled') {
      return (
        <span className="log-badge badge-cancelled">
          <XCircle size={13} />
          キャンセル
        </span>
      );
    }

    // 一般のアクション別バッジ
    if (act === 'INSERT' || act === 'CREATE') {
      if (parsed.importStats) {
        return (
          <span className="log-badge badge-import">
            <FileSpreadsheet size={13} />
            一括インポート
          </span>
        );
      }
      return (
        <span className="log-badge badge-create">
          <PlusCircle size={13} />
          新規登録
        </span>
      );
    }

    if (act === 'UPDATE') {
      return (
        <span className="log-badge badge-update">
          <Edit size={13} />
          予定変更
        </span>
      );
    }

    if (act === 'DELETE') {
      return (
        <span className="log-badge badge-delete">
          <Trash2 size={13} />
          削除
        </span>
      );
    }

    if (act === 'TRANSFER') {
      return (
        <span className="log-badge badge-transfer">
          <Send size={13} />
          行動予定へ移行
        </span>
      );
    }

    if (act === 'CLEAR_ALL') {
      return (
        <span className="log-badge badge-danger">
          <AlertTriangle size={13} />
          全データ削除
        </span>
      );
    }

    if (act === 'UPDATE_RESULT') {
      return (
        <span className="log-badge badge-result">
          <CheckCircle2 size={13} />
          結果更新
        </span>
      );
    }

    return <span className="log-badge badge-default">{action}</span>;
  };

  // クリップボードへコピー
  const handleCopyJson = (id: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // フィルタリング処理
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return logs.filter(log => {
      const parsed = parseAuditDetails(log.details, log.action, log.property_name);
      const act = (log.action || '').toLowerCase();

      // 1. アクション区分フィルター
      if (actionFilter === 'create') {
        if (act !== 'create' && act !== 'insert') return false;
      } else if (actionFilter === 'status') {
        if (!parsed.statusType) return false;
      } else if (actionFilter === 'update') {
        if (act !== 'update' || parsed.statusType) return false;
      } else if (actionFilter === 'delete') {
        if (act !== 'delete' && act !== 'clear_all') return false;
      } else if (actionFilter === 'other') {
        if (act !== 'transfer' && !parsed.importStats && act !== 'update_result') return false;
      }

      // 2. 期間フィルター
      if (dateFilter !== 'all') {
        const logDate = parseLogDate(log.timestamp);
        if (logDate) {
          const diffMs = now.getTime() - logDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (dateFilter === 'today') {
            const isToday = logDate.getFullYear() === now.getFullYear() &&
                            logDate.getMonth() === now.getMonth() &&
                            logDate.getDate() === now.getDate();
            if (!isToday) return false;
          } else if (dateFilter === '7days') {
            if (diffDays > 7) return false;
          } else if (dateFilter === '30days') {
            if (diffDays > 30) return false;
          }
        }
      }

      // 3. フリーワード検索（物件名、号機、担当者、操作者、変更内容）
      if (q) {
        const operator = resolveOperatorName(log.changed_by, parsed.operatorName).toLowerCase();
        const prop = (log.property_name || parsed.propertyName || '').toLowerCase();
        const details = (log.details || '').toLowerCase();
        const unit = (parsed.unitNumber || '').toLowerCase();
        const tagsStr = parsed.tags.map(t => `${t.label} ${t.value}`).join(' ').toLowerCase();

        const match = operator.includes(q) ||
                      prop.includes(q) ||
                      details.includes(q) ||
                      unit.includes(q) ||
                      tagsStr.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [logs, searchQuery, actionFilter, dateFilter, staff]);

  // 日付ごとのグループ分け
  const groupedLogs = useMemo(() => {
    const groups: { dateKey: string; header: string; logs: AuditLog[] }[] = [];
    const dateMap = new Map<string, AuditLog[]>();

    filteredLogs.forEach(log => {
      const key = getDateKey(log.timestamp);
      if (!dateMap.has(key)) {
        dateMap.set(key, []);
      }
      dateMap.get(key)!.push(log);
    });

    dateMap.forEach((groupLogs, key) => {
      groups.push({
        dateKey: key,
        header: formatDateGroupHeader(groupLogs[0].timestamp),
        logs: groupLogs
      });
    });

    return groups;
  }, [filteredLogs]);

  // ログ全体の統計
  const stats = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    let imports = 0;

    logs.forEach(log => {
      const act = (log.action || '').toLowerCase();
      if (act === 'create' || act === 'insert') creates++;
      else if (act === 'update') updates++;
      else if (act === 'delete' || act === 'clear_all') deletes++;
      else imports++;
    });

    return { total: logs.length, creates, updates, deletes, imports };
  }, [logs]);

  if (currentUserRole !== 'admin') {
    return (
      <div className="audit-restricted-card card">
        <ShieldAlert size={48} className="restricted-icon" />
        <h3>アクセス権限がありません</h3>
        <p>変更履歴の閲覧は開発者に制限されています。</p>
      </div>
    );
  }

  return (
    <div className="audit-log-container card">
      {/* ヘッダーエリア */}
      <div className="audit-log-header">
        <div className="audit-title-section">
          <div className="audit-title-row">
            <Layers size={22} className="audit-title-icon" />
            <h2>操作変更履歴 (監査ログ)</h2>
            <span className="audit-total-badge">{stats.total}件記録済</span>
          </div>
          <p className="helper-text">
            誰がいつ予定の登録・変更・削除を行ったかを時系列で追跡します（過去90日分保存）。
          </p>
        </div>
        <button 
          type="button" 
          className="btn btn-secondary btn-sm refresh-btn" 
          onClick={handleRefresh} 
          disabled={loading || loadingMore}
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          最新に更新
        </button>
      </div>

      {/* サマリーカウンターバー */}
      <div className="audit-stats-bar">
        <div className="stat-pill" onClick={() => setActionFilter('all')}>
          <span className="stat-label">総件数</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className={`stat-pill stat-create ${actionFilter === 'create' ? 'active' : ''}`} onClick={() => setActionFilter('create')}>
          <PlusCircle size={13} />
          <span className="stat-label">新規登録</span>
          <span className="stat-value">{stats.creates}</span>
        </div>
        <div className={`stat-pill stat-update ${actionFilter === 'update' ? 'active' : ''}`} onClick={() => setActionFilter('update')}>
          <Edit size={13} />
          <span className="stat-label">変更・更新</span>
          <span className="stat-value">{stats.updates}</span>
        </div>
        <div className={`stat-pill stat-delete ${actionFilter === 'delete' ? 'active' : ''}`} onClick={() => setActionFilter('delete')}>
          <Trash2 size={13} />
          <span className="stat-label">削除</span>
          <span className="stat-value">{stats.deletes}</span>
        </div>
      </div>

      {/* 検索・絞り込みフィルターコントロール */}
      <div className="audit-filter-section">
        <div className="audit-search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="audit-search-input"
            placeholder="物件名、号機、担当者、操作者、作業内容で絞り込み..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              type="button" 
              className="clear-search-btn" 
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {/* 操作種別タブ */}
        <div className="audit-filter-tabs">
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActionFilter('all')}
          >
            すべて
          </button>
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'create' ? 'active' : ''}`}
            onClick={() => setActionFilter('create')}
          >
            新規登録
          </button>
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'status' ? 'active' : ''}`}
            onClick={() => setActionFilter('status')}
          >
            ステータス変更
          </button>
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'update' ? 'active' : ''}`}
            onClick={() => setActionFilter('update')}
          >
            予定・内容変更
          </button>
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'delete' ? 'active' : ''}`}
            onClick={() => setActionFilter('delete')}
          >
            削除
          </button>
          <button 
            type="button" 
            className={`filter-tab-btn ${actionFilter === 'other' ? 'active' : ''}`}
            onClick={() => setActionFilter('other')}
          >
            インポート・移行
          </button>
        </div>

        {/* 期間選択セレクト */}
        <div className="audit-date-filter">
          <Calendar size={14} className="date-filter-icon" />
          <select 
            className="date-filter-select"
            value={dateFilter}
            onChange={(e: any) => setDateFilter(e.target.value)}
          >
            <option value="all">全期間</option>
            <option value="today">今日</option>
            <option value="7days">直近 7 日間</option>
            <option value="30days">直近 30 日間</option>
          </select>
        </div>
      </div>

      {/* 検索結果件数インフォ */}
      {(searchQuery || actionFilter !== 'all' || dateFilter !== 'all') && (
        <div className="audit-filter-results-info">
          <span>絞り込み結果: <strong>{filteredLogs.length}</strong> 件 / 全 {logs.length} 件</span>
          <button 
            type="button" 
            className="btn-reset-filters" 
            onClick={() => {
              setSearchQuery('');
              setActionFilter('all');
              setDateFilter('all');
            }}
          >
            フィルターを解除
          </button>
        </div>
      )}

      {/* メインコンテンツ */}
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
      ) : filteredLogs.length === 0 ? (
        <div className="audit-empty-state">
          <Clock size={48} className="placeholder-icon" />
          <p>{logs.length === 0 ? '変更履歴がありません。' : '条件に一致する変更履歴が見つかりませんでした。'}</p>
        </div>
      ) : (
        <div className="audit-timeline-wrapper">
          {groupedLogs.map(group => (
            <div key={group.dateKey} className="audit-date-group">
              {/* 日付ディバイダー */}
              <div className="audit-date-divider">
                <Calendar size={14} />
                <span>{group.header}</span>
                <span className="date-group-count">{group.logs.length} 件</span>
              </div>

              <div className="audit-timeline">
                {group.logs.map((log) => {
                  const parsed = parseAuditDetails(log.details, log.action, log.property_name);
                  const operator = resolveOperatorName(log.changed_by, parsed.operatorName);
                  const isJsonExpanded = !!expandedJsonIds[log.id];
                  const relativeTime = getRelativeTime(log.timestamp);
                  const displayPropName = log.property_name || parsed.propertyName;

                  return (
                    <div key={log.id} className="audit-timeline-item">
                      <div className="audit-timeline-dot"></div>
                      <div className="audit-timeline-content">
                        {/* メタ情報行: 時刻・アクション・操作者・物件 */}
                        <div className="audit-log-meta-row">
                          <span className="audit-log-time" title={`記録時刻: ${formatTimestamp(log.timestamp)}`}>
                            <Clock size={12} />
                            {formatTimestamp(log.timestamp).split(' ')[1]}
                            {relativeTime && <span className="relative-time">({relativeTime})</span>}
                          </span>

                          {renderActionBadge(log.action, parsed)}

                          {/* 操作者 */}
                          <span className="audit-log-user" title={`アカウント: ${log.changed_by}`}>
                            <User size={13} className="meta-icon" />
                            操作者: <strong>{operator}</strong>
                          </span>

                          {/* 物件名 & 号機 */}
                          {displayPropName && (
                            <span className="audit-log-property-badge">
                              <Building2 size={13} className="meta-icon" />
                              {displayPropName}
                              {parsed.unitNumber && (
                                <span className="unit-number-tag">#{parsed.unitNumber}</span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* カード見出しタイトル */}
                        <div className="audit-log-headline">
                          <h4>{parsed.summaryTitle}</h4>
                        </div>

                        {/* 構造化タググリッド（日付、担当者、種別、時間、作業内容等） */}
                        {parsed.tags.length > 0 && (
                          <div className="audit-tags-grid">
                            {parsed.tags.map((tag, idx) => (
                              <div key={idx} className={`audit-tag-item ${tag.badgeColor ? `tag-${tag.badgeColor}` : ''}`}>
                                <span className="tag-label">{tag.label}:</span>
                                <span className="tag-value">{tag.value}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 非JSONの通常プレーンテキスト */}
                        {!parsed.isJson && parsed.plainText && !parsed.importStats && (
                          <div className="audit-log-plain-text">
                            <p>{parsed.plainText}</p>
                          </div>
                        )}

                        {/* JSON生データ展開アコーディオン（詳細確認用） */}
                        {parsed.isJson && parsed.rawJsonStr && (
                          <div className="audit-json-drawer">
                            <button
                              type="button"
                              className="btn-toggle-json"
                              onClick={() => {
                                setExpandedJsonIds(prev => ({
                                  ...prev,
                                  [log.id]: !prev[log.id]
                                }));
                              }}
                            >
                              <Code size={13} />
                              <span>{isJsonExpanded ? '詳細データを閉じる' : '詳細データ(JSON)を表示'}</span>
                              {isJsonExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isJsonExpanded && (
                              <div className="audit-json-content">
                                <div className="json-toolbar">
                                  <span className="json-title">Raw JSON Payload</span>
                                  <button
                                    type="button"
                                    className="btn-copy-json"
                                    onClick={() => handleCopyJson(log.id, parsed.rawJsonStr || '')}
                                  >
                                    {copiedId === log.id ? (
                                      <>
                                        <Check size={12} className="text-success" />
                                        <span>コピー完了</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={12} />
                                        <span>コピー</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="json-code-block">
                                  <code>{JSON.stringify(parsed.jsonData, null, 2)}</code>
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="audit-load-more-section">
              <button 
                type="button"
                className="btn btn-secondary load-more-btn" 
                onClick={handleLoadMore} 
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <span className="spinner spinner-sm"></span>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    さらに過去の履歴を表示
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
