import React, { useState } from 'react';
import type { Staff, WorkType } from '../types';
import { AuditLogView } from './AuditLogView';
import { Users, Sliders, History, Plus, Trash2, Edit2, Check, X, Shield, ChevronUp, ChevronDown } from 'lucide-react';
import './MasterManagementView.css';

interface MasterManagementViewProps {
  currentUserRole: 'admin' | 'user';
  staff: Staff[];
  workTypes: WorkType[];
  onRefresh: () => void;
  userEmail: string;
}

const API_BASE = 'http://localhost:5000/api';

export const MasterManagementView: React.FC<MasterManagementViewProps> = ({
  currentUserRole,
  staff,
  workTypes,
  onRefresh,
  userEmail,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'staff' | 'work_types' | 'audit_logs'>('staff');

  // スタッフ管理用のローカル状態
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffCourse, setNewStaffCourse] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'user'>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // インライン編集用状態
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [editStaffCourse, setEditStaffCourse] = useState('');
  const [editStaffActive, setEditStaffActive] = useState<number>(1);
  const [editStaffRole, setEditStaffRole] = useState<'admin' | 'user'>('user');

  // 予定項目（種別）管理用状態
  const [newTypeName, setNewTypeName] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editTypeName, setEditTypeName] = useState('');

  if (currentUserRole !== 'admin') {
    return (
      <div className="card text-center" style={{ padding: '3rem' }}>
        <h3>アクセス権限がありません</h3>
        <p>この画面は管理者専用です。</p>
      </div>
    );
  }

  // --- スタッフ管理操作 ---
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({
          name: newStaffName.trim(),
          email: newStaffEmail.trim() || null,
          default_course: newStaffCourse.trim() || null,
          is_active: 1,
          role: newStaffRole,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'スタッフの追加に失敗しました。');
      }

      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffCourse('');
      setNewStaffRole('user');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditStaff = (st: Staff) => {
    setEditingStaffId(st.id);
    setEditStaffName(st.name);
    setEditStaffEmail(st.email || '');
    setEditStaffCourse(st.default_course || '');
    setEditStaffActive(st.is_active !== undefined ? st.is_active : 1);
    setEditStaffRole((st.role || 'user') as 'admin' | 'user');
  };

  const handleCancelEditStaff = () => {
    setEditingStaffId(null);
  };

  const handleUpdateStaff = async (id: number) => {
    if (!editStaffName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({
          name: editStaffName.trim(),
          email: editStaffEmail.trim() || null,
          default_course: editStaffCourse.trim() || null,
          is_active: editStaffActive,
          role: editStaffRole,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'スタッフの更新に失敗しました。');
      }

      setEditingStaffId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id: number, name: string) => {
    if (!window.confirm(`スタッフ「${name}」を完全に削除してもよろしいですか？`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': userEmail,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'スタッフの削除に失敗しました。');
      }

      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 予定項目（種別）操作 ---
  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/work_types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({
          name: newTypeName.trim(),
          is_internal: isInternal ? 1 : 0,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '項目の追加に失敗しました。');
      }

      setNewTypeName('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteType = async (id: number, name: string) => {
    if (!window.confirm(`項目「${name}」を削除してもよろしいですか？\n※既存の予定データは削除されませんが、新規候補から除外されます。`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/work_types/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': userEmail,
        },
      });

      if (!response.ok) {
        throw new Error('項目の削除に失敗しました。');
      }

      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditType = (t: WorkType) => {
    setEditingTypeId(t.id);
    setEditTypeName(t.name);
  };

  const handleCancelEditType = () => {
    setEditingTypeId(null);
  };

  const handleUpdateType = async (id: number) => {
    if (!editTypeName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/work_types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({
          name: editTypeName.trim()
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '項目の更新に失敗しました。');
      }

      setEditingTypeId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoveType = async (t: WorkType, direction: 'up' | 'down') => {
    const list = t.is_internal === 1 ? internalTypes : fieldTypes;
    const index = list.findIndex(item => item.id === t.id);
    if (index === -1) return;

    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= list.length) return; // 端なので移動不可

    const neighbor = list[neighborIndex];

    // sort_order の入れ替え
    const currentOrder = t.sort_order ?? 0;
    const neighborOrder = neighbor.sort_order ?? 0;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/work_types/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({
          orders: [
            { id: t.id, sort_order: neighborOrder },
            { id: neighbor.id, sort_order: currentOrder }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error('並び替えの保存に失敗しました。');
      }

      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const internalTypes = workTypes.filter(t => t.is_internal === 1);
  const fieldTypes = workTypes.filter(t => t.is_internal === 0);

  return (
    <div className="master-mgmt-container">
      {/* マスタ管理専用サブヘッダー（タブ切り替え） */}
      <div className="master-mgmt-tabs">
        <button
          className={`master-tab-btn ${activeSubTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('staff')}
        >
          <Users size={16} />
          スタッフ設定
        </button>
        <button
          className={`master-tab-btn ${activeSubTab === 'work_types' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('work_types')}
        >
          <Sliders size={16} />
          予定項目（種別）設定
        </button>
        <button
          className={`master-tab-btn ${activeSubTab === 'audit_logs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('audit_logs')}
        >
          <History size={16} />
          変更履歴（監査ログ）
        </button>
      </div>

      <div className="master-mgmt-content">
        {/* --- 1. スタッフ設定 --- */}
        {activeSubTab === 'staff' && (
          <div className="master-section">
            <div className="master-section-header">
              <h3>スタッフ（対応者）マスタ管理</h3>
              <p className="helper-text">
                予定表や担当者選択ドロップダウンに表示されるスタッフ情報を管理します。
              </p>
            </div>

            {/* 新規追加フォーム */}
            <form onSubmit={handleAddStaff} className="master-add-form card">
              <h4>新規スタッフの登録</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>氏名 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="例: 佐藤"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label>メールアドレス</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="例: sato@example.com"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label>デフォルトコース</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="例: 8, 90"
                    value={newStaffCourse}
                    onChange={(e) => setNewStaffCourse(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label>アクセス権限</label>
                  <select
                    className="form-control"
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as 'admin' | 'user')}
                    disabled={isSubmitting}
                  >
                    <option value="user">一般ユーザー</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
              </div>
              <div className="form-actions-right">
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !newStaffName.trim()}>
                  <Plus size={16} /> 追加する
                </button>
              </div>
            </form>

            {/* スタッフ一覧テーブル */}
            <div className="master-table-wrapper card">
              <table className="master-table">
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>メールアドレス</th>
                    <th style={{ width: '130px' }}>デフォルトコース</th>
                    <th style={{ width: '120px' }}>アクセス権限</th>
                    <th style={{ width: '100px' }}>状態</th>
                    <th style={{ width: '150px', textAlign: 'center' }}>アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((st) => {
                    const isEditing = editingStaffId === st.id;
                    const isActive = st.is_active !== 0;

                    return (
                      <tr key={st.id} className={`master-table-row ${!isActive ? 'row-disabled' : ''}`}>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={editStaffName}
                              onChange={(e) => setEditStaffName(e.target.value)}
                            />
                          ) : (
                            <span className="staff-name-text">{st.name}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="email"
                              className="form-control form-control-sm"
                              value={editStaffEmail}
                              onChange={(e) => setEditStaffEmail(e.target.value)}
                            />
                          ) : (
                            st.email || <span className="text-muted">なし</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={editStaffCourse}
                              onChange={(e) => setEditStaffCourse(e.target.value)}
                            />
                          ) : (
                            st.default_course || <span className="text-muted">なし</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="form-control form-control-sm"
                              value={editStaffRole}
                              onChange={(e) => setEditStaffRole(e.target.value as 'admin' | 'user')}
                            >
                              <option value="user">一般</option>
                              <option value="admin">管理者</option>
                            </select>
                          ) : st.role === 'admin' ? (
                            <span className="badge-admin">
                              <Shield size={10} style={{ marginRight: '2px' }} />
                              管理者
                            </span>
                          ) : (
                            <span className="text-muted">一般</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="form-control form-control-sm"
                              value={editStaffActive}
                              onChange={(e) => setEditStaffActive(Number(e.target.value))}
                            >
                              <option value={1}>有効</option>
                              <option value={0}>無効</option>
                            </select>
                          ) : isActive ? (
                            <span className="badge-active">有効</span>
                          ) : (
                            <span className="badge-inactive">無効</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="table-actions">
                            {isEditing ? (
                              <>
                                <button
                                  className="icon-btn btn-success"
                                  onClick={() => handleUpdateStaff(st.id)}
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="icon-btn btn-secondary"
                                  onClick={handleCancelEditStaff}
                                  title="キャンセル"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="icon-btn btn-primary-light"
                                  onClick={() => handleStartEditStaff(st)}
                                  title="編集"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  className="icon-btn btn-danger-light"
                                  onClick={() => handleDeleteStaff(st.id, st.name)}
                                  title="削除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- 2. 予定項目設定 --- */}
        {activeSubTab === 'work_types' && (
          <div className="master-section">
            <div className="master-section-header">
              <h3>予定項目（種別）設定</h3>
              <p className="helper-text">
                通常予定の登録モーダルや月間予定表の簡易フォーム（フリースペース）で選択する項目マスタです。
              </p>
              <p className="helper-text-warning" style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: '0.25rem', fontWeight: 600 }}>
                ※注意: 「休暇」などの初期から存在する主要な項目名を変更または削除すると、カレンダーのグレーアウト表示や一部の自動入力機能が動作しなくなる場合があります。
              </p>
            </div>

            {/* 追加フォーム */}
            <form onSubmit={handleAddType} className="master-add-form card">
              <h4>新規項目の追加</h4>
              <div className="form-grid-row">
                <div className="form-group flex-1">
                  <label>項目（種別）名 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="例: 健康診断, 出張など"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group select-group">
                  <label>項目の分類</label>
                  <div className="quick-type-toggle">
                    <div 
                      className={`type-toggle-btn ${isInternal ? 'active' : ''}`}
                      onClick={() => setIsInternal(true)}
                    >
                      社内予定（フリースペース用）
                    </div>
                    <div 
                      className={`type-toggle-btn ${!isInternal ? 'active' : ''}`}
                      onClick={() => setIsInternal(false)}
                    >
                      現場作業（通常グリッド用）
                    </div>
                  </div>
                </div>
                <div className="form-group button-group">
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting || !newTypeName.trim()}>
                    <Plus size={16} /> 追加する
                  </button>
                </div>
              </div>
            </form>

            {/* 左右2カラムの一覧 */}
            <div className="worktype-lists-container">
              {/* 社内予定項目 */}
              <div className="worktype-list-column card">
                <h4>社内予定（フリースペースに表示）</h4>
                <div className="worktype-items-list">
                  {internalTypes.length === 0 ? (
                    <p className="no-items-text">項目が登録されていません</p>
                  ) : (
                    internalTypes.map((t, idx) => {
                      const isEditing = editingTypeId === t.id;
                      const isFirst = idx === 0;
                      const isLast = idx === internalTypes.length - 1;

                      return (
                        <div key={t.id} className="worktype-item-card">
                          {isEditing ? (
                            <div className="worktype-item-edit-mode">
                              <input
                                type="text"
                                className="form-control form-control-sm edit-type-input"
                                value={editTypeName}
                                onChange={(e) => setEditTypeName(e.target.value)}
                                disabled={isSubmitting}
                                autoFocus
                              />
                              <div className="worktype-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn btn-success"
                                  onClick={() => handleUpdateType(t.id)}
                                  disabled={isSubmitting || !editTypeName.trim()}
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary"
                                  onClick={handleCancelEditType}
                                  disabled={isSubmitting}
                                  title="キャンセル"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="worktype-item-view-mode">
                              <span className="worktype-name-label">{t.name}</span>
                              <div className="worktype-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary-light"
                                  onClick={() => handleMoveType(t, 'up')}
                                  disabled={isSubmitting || isFirst}
                                  title="上へ移動"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary-light"
                                  onClick={() => handleMoveType(t, 'down')}
                                  disabled={isSubmitting || isLast}
                                  title="下へ移動"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-primary-light"
                                  onClick={() => handleStartEditType(t)}
                                  disabled={isSubmitting}
                                  title="編集"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-danger-light"
                                  onClick={() => handleDeleteType(t.id, t.name)}
                                  disabled={isSubmitting}
                                  title="削除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 現場作業予定項目 */}
              <div className="worktype-list-column card">
                <h4>現場作業（通常の予定グリッドに表示）</h4>
                <div className="worktype-items-list">
                  {fieldTypes.length === 0 ? (
                    <p className="no-items-text">項目が登録されていません</p>
                  ) : (
                    fieldTypes.map((t, idx) => {
                      const isEditing = editingTypeId === t.id;
                      const isFirst = idx === 0;
                      const isLast = idx === fieldTypes.length - 1;

                      return (
                        <div key={t.id} className="worktype-item-card">
                          {isEditing ? (
                            <div className="worktype-item-edit-mode">
                              <input
                                type="text"
                                className="form-control form-control-sm edit-type-input"
                                value={editTypeName}
                                onChange={(e) => setEditTypeName(e.target.value)}
                                disabled={isSubmitting}
                                autoFocus
                              />
                              <div className="worktype-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn btn-success"
                                  onClick={() => handleUpdateType(t.id)}
                                  disabled={isSubmitting || !editTypeName.trim()}
                                  title="保存"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary"
                                  onClick={handleCancelEditType}
                                  disabled={isSubmitting}
                                  title="キャンセル"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="worktype-item-view-mode">
                              <span className="worktype-name-label">{t.name}</span>
                              <div className="worktype-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary-light"
                                  onClick={() => handleMoveType(t, 'up')}
                                  disabled={isSubmitting || isFirst}
                                  title="上へ移動"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-secondary-light"
                                  onClick={() => handleMoveType(t, 'down')}
                                  disabled={isSubmitting || isLast}
                                  title="下へ移動"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-primary-light"
                                  onClick={() => handleStartEditType(t)}
                                  disabled={isSubmitting}
                                  title="編集"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn btn-danger-light"
                                  onClick={() => handleDeleteType(t.id, t.name)}
                                  disabled={isSubmitting}
                                  title="削除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- 3. 変更履歴（監査ログ） --- */}
        {activeSubTab === 'audit_logs' && (
          <div className="master-section">
            <AuditLogView currentUserRole={currentUserRole} />
          </div>
        )}
      </div>
    </div>
  );
};
