import React, { useState } from 'react';
import type { Staff, WorkType } from '../types';
import { AuditLogView } from './AuditLogView';
import { Users, Sliders, History, Plus, Trash2, Edit2, Check, X, Shield, ChevronUp, ChevronDown, Database, RefreshCw } from 'lucide-react';
import { supabase, talkScriptSupabase } from '../supabaseClient';

import './MasterManagementView.css';

interface MasterManagementViewProps {
  currentUserRole: 'admin' | 'user';
  staff: Staff[];
  workTypes: WorkType[];
  onRefresh: () => void;
  onClearSchedules: () => Promise<void>;
}

export const MasterManagementView: React.FC<MasterManagementViewProps> = ({
  currentUserRole,
  staff,
  workTypes,
  onRefresh,
  onClearSchedules,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'staff' | 'work_types' | 'audit_logs' | 'data_maintenance'>('staff');

  // スタッフ管理用のローカル状態
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffCourse, setNewStaffCourse] = useState('');
  const [newStaffEmpCode, setNewStaffEmpCode] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'user'>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // データメンテナンス用の状態
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // インライン編集用状態
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [editStaffCourse, setEditStaffCourse] = useState('');
  const [editStaffEmpCode, setEditStaffEmpCode] = useState('');
  const [editStaffActive, setEditStaffActive] = useState<number>(1);
  const [editStaffRole, setEditStaffRole] = useState<'admin' | 'user'>('user');

  // 予定項目（種別）管理用状態
  const [newTypeName, setNewTypeName] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editTypeName, setEditTypeName] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);

  if (currentUserRole !== 'admin') {
    return (
      <div className="card text-center" style={{ padding: '3rem' }}>
        <h3>アクセス権限がありません</h3>
        <p>この画面は管理者専用です。</p>
      </div>
    );
  }

  const normalizeName = (str: string) => {
    return str
      .replace(/﨑/g, '崎')
      .replace(/髙/g, '高')
      .replace(/邊/g, '辺')
      .replace(/邉/g, '辺')
      .replace(/\s+/g, '') // 空白除去
      .toLowerCase()
      .trim();
  };

  const handleSyncMicrosoftAccounts = async () => {
    const proceed = window.confirm(
      "外部プロジェクトのMicrosoftプロフィールと同期します。\n" +
      "スタッフの名前（苗字）とプロフィールの氏名が一致する人のメールアドレスを一括更新します。\n\n" +
      "※同期処理を開始してもよろしいですか？"
    );
    if (!proceed) return;

    setIsSyncing(true);
    try {
      // 1. 外部 profiles の取得
      const { data: profiles, error: profError } = await talkScriptSupabase
        .from('profiles')
        .select('display_name, email, employee_id');

      if (profError) {
        throw new Error(`外部プロフィールの取得に失敗しました: ${profError.message}`);
      }

      if (!profiles || profiles.length === 0) {
        throw new Error('外部プロフィールデータが見つかりませんでした。');
      }

      // 2. 現在のスタッフリストを取得（最新の状態）
      const { data: currentStaff, error: staffError } = await supabase
        .from('staff')
        .select('id, name, email, employee_code, default_course');

      if (staffError) {
        throw new Error(`スタッフリストの取得に失敗しました: ${staffError.message}`);
      }

      let matchedCount = 0;
      let skippedCount = 0;
      const updatePromises = [];

      for (const st of currentStaff || []) {
        // 外注メンバー（FE, SF, FR で始まる、またはコース番号が90以降）は同期対象外としてスキップ
        const isOutsourceName = /^(FE|SF|FR)/i.test(st.name);
        const isOutsourceCourse = st.default_course ? parseInt(st.default_course, 10) >= 90 : false;
        if (isOutsourceName || isOutsourceCourse) {
          skippedCount++;
          continue;
        }

        // 社員番号が設定されている場合は、社員番号ベースで最優先マッチ
        const stEmpCode = st.employee_code ? String(st.employee_code).trim() : '';
        let matchedProfile = null;

        if (stEmpCode) {
          matchedProfile = profiles.find(p => p.employee_id && String(p.employee_id).trim() === stEmpCode);
        }

        // 社員番号でマッチしない、または社員番号が未設定の場合は名前でマッチ
        if (!matchedProfile) {
          // prefix (FE, SF, FR) を取り除いたクリーンな苗字
          const cleanName = st.name.replace(/^(FE|SF|FR)/i, '').trim();
          if (!cleanName) {
            skippedCount++;
            continue;
          }

          const normCleanName = normalizeName(cleanName);

          // フーギー / ナルマンダフ・フスレンバヤル 用の特別マッチング
          const isStHoogy = normCleanName.includes('フーギー') || normCleanName.includes('ナルマンダフ') || normCleanName.includes('フスレンバヤル');
          if (isStHoogy) {
            matchedProfile = profiles.find(p => {
              if (!p.display_name) return false;
              const normDispName = normalizeName(p.display_name);
              return normDispName.includes('フーギー') || normDispName.includes('ナルマンダフ') || normDispName.includes('フスレンバヤル') || (p.email && p.email.toLowerCase().includes('n_khus'));
            });
          } else {
            // 完全一致するプロフィールをすべて抽出（被り検出のため）
            const exactMatches = profiles.filter(p => {
              if (!p.display_name) return false;
              const normDispName = normalizeName(p.display_name);
              return normDispName === normCleanName;
            });

            // 完全一致が「唯一」存在する場合のみマッチとする（佐藤などの名前被りでの誤判定を防ぐ）
            if (exactMatches.length === 1) {
              matchedProfile = exactMatches[0];
            } else if (exactMatches.length > 1) {
              console.warn(`名前被りが発生したため同期をスキップしました: ${st.name}`, exactMatches);
            }
          }
        }

        if (matchedProfile && matchedProfile.email) {
          const profileEmail = matchedProfile.email.toLowerCase().trim();
          let profileName = matchedProfile.display_name ? matchedProfile.display_name.trim() : '';
          const profileEmpCode = matchedProfile.employee_id ? String(matchedProfile.employee_id).trim() : '';

          // 苗字と名前の間に半角スペースを挿入する（getShortNameが正しく機能するようにするため）
          if (profileName) {
            const SURNAMES = [
              '平本', '築地', '藤井', '神崎', '原', '土橋', '藤田', '佐藤', '吉沼', '小山', 
              '高橋', '畦崎', '松下', '淺沼', '山内', '中川', '阿部', '藤崎', '本間', '丸山', 
              '清水', '塙', '伊比', '石山', '平井', '豊見本', '富本'
            ];
            const matchedSurname = SURNAMES.find(s => profileName.startsWith(s));
            if (matchedSurname && profileName !== matchedSurname) {
              const firstName = profileName.slice(matchedSurname.length).trim();
              if (firstName) {
                profileName = `${matchedSurname} ${firstName}`;
              }
            }
          }

          const updateData: any = {};

          if (!st.email || st.email.toLowerCase().trim() !== profileEmail) {
            updateData.email = profileEmail;
          }

          if (profileName && st.name.trim() !== profileName) {
            updateData.name = profileName;
          }

          if (!st.employee_code && profileEmpCode) {
            updateData.employee_code = profileEmpCode;
          }

          if (Object.keys(updateData).length === 0) {
            skippedCount++;
            continue;
          }

          // 更新クエリを準備
          updatePromises.push(
            supabase
              .from('staff')
              .update(updateData)
              .eq('id', st.id)
              .then(({ error }) => {
                if (error) {
                  console.error(`Failed to update ${st.name}:`, error.message);
                  return false;
                }
                matchedCount++;
                return true;
              })
          );
        } else {
          skippedCount++;
        }
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      alert(
        `同期処理が完了しました！\n\n` +
        `・新規同期（メール更新）: ${matchedCount} 名\n` +
        `・スキップ（未マッチまたは既に同期済）: ${skippedCount} 名`
      );

      onRefresh();
    } catch (err: any) {
      alert(err.message || '同期中にエラーが発生しました。');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- スタッフ管理操作 ---

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('staff').insert([
        {
          name: newStaffName.trim(),
          email: newStaffEmail.trim() || null,
          default_course: newStaffCourse.trim() || null,
          employee_code: newStaffEmpCode.trim() || null,
          is_active: 1,
          role: newStaffRole,
        }
      ]);

      if (error) {
        throw new Error(error.message || 'スタッフの追加に失敗しました。');
      }

      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffCourse('');
      setNewStaffEmpCode('');
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
    setEditStaffEmpCode(st.employee_code || '');
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
      const { error } = await supabase.from('staff').update({
        name: editStaffName.trim(),
        email: editStaffEmail.trim() || null,
        default_course: editStaffCourse.trim() || null,
        employee_code: editStaffEmpCode.trim() || null,
        is_active: editStaffActive,
        role: editStaffRole,
      }).eq('id', id);

      if (error) {
        throw new Error(error.message || 'スタッフの更新に失敗しました。');
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
      const { error } = await supabase.from('staff').delete().eq('id', id);

      if (error) {
        throw new Error(error.message || 'スタッフの削除に失敗しました。');
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
      const { error } = await supabase.from('work_types').insert([
        {
          name: newTypeName.trim(),
          is_internal: isInternal ? 1 : 0,
        }
      ]);

      if (error) {
        throw new Error(error.message || '項目の追加に失敗しました。');
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
      const { error } = await supabase.from('work_types').delete().eq('id', id);

      if (error) {
        throw new Error(error.message || '項目の削除に失敗しました。');
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
      const { error } = await supabase.from('work_types').update({
        name: editTypeName.trim()
      }).eq('id', id);

      if (error) {
        throw new Error(error.message || '項目の更新に失敗しました。');
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
    if (neighborIndex < 0 || neighborIndex >= list.length) return;

    const neighbor = list[neighborIndex];

    const currentOrder = t.sort_order ?? 0;
    const neighborOrder = neighbor.sort_order ?? 0;

    setIsSubmitting(true);
    try {
      const { error: error1 } = await supabase.from('work_types').update({ sort_order: neighborOrder }).eq('id', t.id);
      const { error: error2 } = await supabase.from('work_types').update({ sort_order: currentOrder }).eq('id', neighbor.id);

      if (error1 || error2) {
        throw new Error('並び替えの保存に失敗しました。');
      }

      onRefresh();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearSchedulesConfirm = async () => {
    if (deleteConfirmText !== '削除') {
      alert('確認用のテキストが正しくありません。');
      return;
    }

    if (!window.confirm('【最終確認】本当にすべてのスケジュールデータを完全に削除してよろしいですか？\nこの操作は元に戻せません。')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onClearSchedules();
      setDeleteConfirmText('');
      alert('スケジュールデータをすべて削除しました。');
    } catch (err: any) {
      alert(err.message || '削除中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };


  const internalTypes = workTypes.filter(t => t.is_internal === 1);
  const fieldTypes = workTypes.filter(t => t.is_internal === 0);

  // スタッフをコース番号の数値昇順でソート
  const sortedStaff = React.useMemo(() => {
    return [...staff].sort((a, b) => {
      const aCourse = a.default_course ? parseInt(a.default_course, 10) : NaN;
      const bCourse = b.default_course ? parseInt(b.default_course, 10) : NaN;
      
      const aIsNan = isNaN(aCourse);
      const bIsNan = isNaN(bCourse);
      
      // 両方とも数値でない（または設定なし）場合は、文字列順で比較
      if (aIsNan && bIsNan) {
        const aVal = a.default_course || '';
        const bVal = b.default_course || '';
        return aVal.localeCompare(bVal);
      }
      // 片方だけ数値でない場合は、数値でない方を後ろに並べる
      if (aIsNan) return 1;
      if (bIsNan) return -1;
      
      return aCourse - bCourse;
    });
  }, [staff]);

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
        <button
          className={`master-tab-btn ${activeSubTab === 'data_maintenance' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('data_maintenance')}
        >
          <Database size={16} />
          データ管理
        </button>
      </div>

      <div className="master-mgmt-content">
        {/* --- 1. スタッフ設定 --- */}
        {activeSubTab === 'staff' && (
          <div className="master-section">
            <div className="master-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3>スタッフ（対応者）マスタ管理</h3>
                <p className="helper-text">
                  予定表や担当者選択ドロップダウンに表示されるスタッフ情報を管理します。
                </p>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={handleSyncMicrosoftAccounts}
                disabled={isSyncing}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
              >
                <RefreshCw size={16} className={isSyncing ? 'spin-animation' : ''} />
                {isSyncing ? 'Microsoftアカウント同期中...' : 'Microsoftアカウント同期 (アバター連携)'}
              </button>
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
                    value={newStaffCourse}
                    onChange={(e) => setNewStaffCourse(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label>社員番号</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newStaffEmpCode}
                    onChange={(e) => setNewStaffEmpCode(e.target.value)}
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
                    <th style={{ width: '110px' }}>社員番号</th>
                    <th style={{ width: '130px' }}>デフォルトコース</th>
                    <th style={{ width: '120px' }}>アクセス権限</th>
                    <th style={{ width: '100px' }}>状態</th>
                    <th style={{ width: '150px', textAlign: 'center' }}>アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStaff.map((st) => {
                    const isEditing = editingStaffId === st.id;

                    const isActive = st.is_active !== 0;

                    return (
                      <tr key={st.id} className={`master-table-row ${!isActive ? 'row-disabled' : ''}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {st.avatar_url ? (
                              <img 
                                src={st.avatar_url} 
                                alt={st.name} 
                                className="master-staff-avatar" 
                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div className="master-staff-avatar-placeholder" style={{ 
                                backgroundColor: 'var(--primary)', 
                                width: '28px', 
                                height: '28px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: 'white', 
                                fontSize: '0.8rem', 
                                fontWeight: 'bold' 
                              }}>
                                {st.name.replace(/^(FE|SF|FR)/i, '').trim().charAt(0) || st.name.charAt(0)}
                              </div>
                            )}
                            {isEditing ? (
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={editStaffName}
                                onChange={(e) => setEditStaffName(e.target.value)}
                                style={{ flex: 1 }}
                              />
                            ) : (
                              <span className="staff-name-text">{st.name}</span>
                            )}
                          </div>
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
                              value={editStaffEmpCode}
                              onChange={(e) => setEditStaffEmpCode(e.target.value)}
                            />
                          ) : (
                            st.employee_code || <span className="text-muted">なし</span>
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

        {/* --- 4. データ管理 --- */}
        {activeSubTab === 'data_maintenance' && (
          <div className="master-section">
            <div className="master-section-header">
              <h3>データメンテナンス</h3>
              <p className="helper-text">
                システム全体のデータクリーンアップや初期化を行います。
              </p>
            </div>

            <div className="card data-maintenance-card" style={{ padding: '2rem', border: '1px solid var(--danger-light, #fee2e2)' }}>
              <h4 style={{ color: 'var(--danger, #dc2626)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={20} />
                スケジュールデータの一括削除
              </h4>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                データベース内のすべての予定データ（`schedules`）を完全に消去します。<br />
                ※物件マスタ, スタッフマスタ, 予定項目マスタ, および変更履歴（監査ログ）は<strong>削除されません</strong>。<br />
                <strong>この操作は取り消せません。本番環境で実行する際は十分に注意してください。</strong>
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '450px' }}>
                <div className="form-group">
                  <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                    確認のため、下の入力欄に「<span style={{ color: 'var(--danger, #dc2626)' }}>削除</span>」と入力してください。
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="削除と入力してください"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleClearSchedulesConfirm}
                  disabled={isSubmitting || deleteConfirmText !== '削除'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}
                >
                  <Trash2 size={16} />
                  すべてのスケジュールデータを削除する
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
