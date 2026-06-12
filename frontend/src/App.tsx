import { useState, useEffect } from 'react';
import type { Schedule, Staff, WorkType } from './types';
import { GridView } from './components/GridView';
import { CalendarView } from './components/CalendarView';
import { TimelineView } from './components/TimelineView';
import { MasterManagementView } from './components/MasterManagementView';
import { AnalyticsView } from './components/AnalyticsView';
import { ScheduleModal } from './components/ScheduleModal';
import { PasteImportModal } from './components/PasteImportModal';
import { Calendar, Layers, Plus, RefreshCw, AlertCircle, List, Sliders, Sun, Moon, BarChart3 } from 'lucide-react';
import { supabase } from './supabaseClient';


const API_BASE = 'http://localhost:5000/api';

function App() {
  const [activeTab, setActiveTab] = useState<'grid' | 'timeline' | 'calendar' | 'master_management' | 'analytics'>('grid');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [user, setUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'user'>('user');
  const [currentStaffId, setCurrentStaffId] = useState<number | null>(null);

  // ユーザーとスタッフマスタの突合でロール・IDを自動決定
  useEffect(() => {
    if (user && staff.length > 0) {
      if (user.id === 'demo-admin-id') {
        setCurrentUserRole('admin');
        setCurrentStaffId(8); // 佐藤さん (管理者)
        return;
      }
      if (user.id === 'demo-user-id') {
        setCurrentUserRole('user');
        setCurrentStaffId(4); // 神崎さん (一般ユーザー)
        return;
      }
      
      const matched = staff.find(s => s.email === user.email);
      if (matched) {
        setCurrentUserRole((matched.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user');
        setCurrentStaffId(matched.id);
      } else {
        setCurrentUserRole('user');
        setCurrentStaffId(null);
      }
    } else {
      setCurrentUserRole('user');
      setCurrentStaffId(null);
    }
  }, [user, staff]);

  useEffect(() => {
    if (currentUserRole !== 'admin' && (activeTab === 'calendar' || activeTab === 'master_management' || activeTab === 'analytics')) {
      setActiveTab('grid');
    }
  }, [currentUserRole, activeTab]);

  useEffect(() => {
    // 現在のセッションを取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      }
    });

    // 認証状態の変化を購読
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    const proceed = window.confirm(
      "Microsoftログインを開始します。\n\n※Supabase側でのAzure AD (Entra ID) 連携設定が完了していない場合、エラー画面へ遷移して元の画面が消えてしまう（リダイレクトされる）可能性があります。\n続行しますか？\n(手軽な動作確認には「デモログイン」をお使いください)"
    );
    if (!proceed) return;

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'openid profile email offline_access',
        }
      });
      if (error) throw error;
    } catch (err: any) {
      alert('ログインに失敗しました: ' + err.message);
    }
  };

  const handleDemoAdminLogin = () => {
    setUser({
      id: 'demo-admin-id',
      email: 'sato@example.com',
      user_metadata: {
        full_name: '佐藤（管理者デモ）',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80'
      }
    });
  };

  const handleDemoUserLogin = () => {
    setUser({
      id: 'demo-user-id',
      email: 'kanzaki@example.com',
      user_metadata: {
        full_name: '神崎（一般作業者デモ）',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80'
      }
    });
  };

  const handleLogout = async () => {
    try {
      if (user && (user.id === 'demo-user-id' || user.id === 'demo-admin-id')) {
        setUser(null);
        setShowUserMenu(false);
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setShowUserMenu(false);
    } catch (err: any) {
      alert('ログアウトに失敗しました: ' + err.message);
    }
  };

  const handleUpdateScheduleResult = async (
    scheduleId: number | string, 
    resultValue: string,
    startedAt?: string | null,
    completedAt?: string | null,
    reportNotes?: string | null
  ) => {
    try {
      const payload: any = { result: resultValue };
      if (startedAt !== undefined) payload.started_at = startedAt;
      if (completedAt !== undefined) payload.completed_at = completedAt;
      if (reportNotes !== undefined) payload.report_notes = reportNotes;

      const res = await fetch(`${API_BASE}/schedules/${scheduleId}/result`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || 'system'
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('結果の更新に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  const handleReorderSchedules = async (orders: { id: number | string; sort_order: number }[]) => {
    try {
      const res = await fetch(`${API_BASE}/schedules/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || 'system'
        },
        body: JSON.stringify({ orders }),
      });

      if (!res.ok) {
        throw new Error('並び順の更新に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  const handleTransferSchedules = async (dateStr: string) => {
    try {
      const res = await fetch(`${API_BASE}/schedules/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || 'system'
        },
        body: JSON.stringify({ date: dateStr })
      });

      if (!res.ok) {
        throw new Error('予定の移行に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);


  const fetchData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [schedulesRes, staffRes, workTypesRes] = await Promise.all([
        fetch(`${API_BASE}/schedules`),
        fetch(`${API_BASE}/staff`),
        fetch(`${API_BASE}/work_types`)
      ]);

      if (!schedulesRes.ok || !staffRes.ok || !workTypesRes.ok) {
        throw new Error('データの取得に失敗しました。サーバーが起動しているか確認してください。');
      }

      const schedulesData = await schedulesRes.json();
      const staffData = await staffRes.json();
      const workTypesData = await workTypesRes.json();

      setSchedules(schedulesData);
      setStaff(staffData);
      setWorkTypes(workTypesData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '通信エラーが発生しました。');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddModal = (dateStr: string) => {
    setSelectedSchedule(null);
    setSelectedDate(dateStr);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(schedule.date);
    setIsModalOpen(true);
  };

  const handleSaveSchedule = async (scheduleData: Partial<Schedule>) => {
    const isEdit = !!scheduleData.id;
    const url = isEdit ? `${API_BASE}/schedules/${scheduleData.id}` : `${API_BASE}/schedules`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || 'system'
        },
        body: JSON.stringify(scheduleData),
      });

      if (!res.ok) {
        throw new Error('予定の保存に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': user?.email || 'system'
        }
      });

      if (!res.ok) {
        throw new Error('予定の削除に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  return (
    <div className="app-container">
      {/* 未ログイン時のログインゲートウェイ */}
      {!user ? (
        <div className="login-gateway-container">
          <div className="login-card">
            <h2>現地対応予定・行動管理システム</h2>
            <p className="login-subtitle">続行するにはサインインしてください</p>
            
            <button className="btn btn-primary btn-login-main" onClick={handleLogin}>
              Microsoft アカウントでログイン
            </button>

            <div className="demo-login-divider">
              <span>またはデモ環境でテスト</span>
            </div>

            <div className="demo-login-buttons">
              <button className="btn btn-secondary" onClick={handleDemoAdminLogin}>
                管理者権限でデモログイン
              </button>
              <button className="btn btn-secondary" onClick={handleDemoUserLogin}>
                一般作業者でデモログイン
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <header>
            <div className="logo-section">
              <h1>現地対応予定・行動管理システム</h1>
              <span className="badge badge-dev">
                {currentUserRole === 'admin' ? '管理者環境' : '一般作業者環境'}
              </span>
            </div>

            <div className="nav-tabs">
              <button
                className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
                onClick={() => setActiveTab('grid')}
              >
                <List size={16} />
                予定表 (グリッド)
              </button>
              <button
                className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                onClick={() => setActiveTab('timeline')}
              >
                <Layers size={16} />
                当日行動予定表
              </button>
              {currentUserRole === 'admin' && (
                <>
                  <button
                    className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('calendar')}
                  >
                    <Calendar size={16} />
                    月間予定表
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                  >
                    <BarChart3 size={16} />
                    集計分析
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'master_management' ? 'active' : ''}`}
                    onClick={() => setActiveTab('master_management')}
                  >
                    <Sliders size={16} />
                    マスタ管理
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
                title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button className="btn btn-secondary" onClick={() => fetchData(false)} title="データを更新">
                <RefreshCw size={16} />
              </button>
              {currentUserRole === 'admin' && (
                <>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setIsImportOpen(true)}
                    title="Excelやスプレッドシートからコピーしたデータを貼り付け"
                  >
                    スプレッドシートから貼り付け
                  </button>

                  <button 
                    className="btn btn-primary"
                    onClick={() => handleOpenAddModal(new Date().toISOString().split('T')[0])}
                  >
                    <Plus size={16} />
                    予定を追加
                  </button>
                </>
              )}

              {/* アカウント表示エリア */}
              <div className="user-profile-section">
                <div className="user-profile-trigger" onClick={() => setShowUserMenu(!showUserMenu)}>
                  {user.user_metadata?.avatar_url || user.user_metadata?.picture ? (
                    <img 
                      src={user.user_metadata.avatar_url || user.user_metadata.picture} 
                      alt={user.user_metadata?.full_name || 'User'} 
                      className="user-avatar"
                    />
                  ) : (
                    <div className="user-avatar-fallback">
                      {user.user_metadata?.full_name ? user.user_metadata.full_name.substring(0, 1) : 'U'}
                    </div>
                  )}
                  <span className="user-name">{user.user_metadata?.full_name || user.email}</span>
                  {showUserMenu && (
                    <div className="user-menu-dropdown">
                      <div className="user-menu-info">
                        <p className="user-menu-name">{user.user_metadata?.full_name || 'ユーザー'}</p>
                        <p className="user-menu-email">{user.email}</p>
                        <p className="user-menu-role">権限: {currentUserRole === 'admin' ? '管理者' : '一般作業者'}</p>
                      </div>
                      <div className="user-menu-divider"></div>
                      <button className="user-menu-item logout-btn" onClick={handleLogout}>
                        ログアウト
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </header>

          <main style={{ maxWidth: '100%', padding: '0 1rem', position: 'relative' }}>
            {loading && schedules.length === 0 ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>データを読み込み中...</p>
              </div>
            ) : error ? (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
                <AlertCircle size={48} style={{ color: 'var(--danger)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>接続エラー</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px' }}>{error}</p>
                <button className="btn btn-primary" onClick={() => fetchData(false)}>
                  再試行する
                </button>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="loading-overlay">
                    <div className="spinner"></div>
                  </div>
                )}
                {activeTab === 'grid' && (
                  <GridView
                    schedules={schedules.filter(s => s.is_transferred === 1)}
                    staff={staff}
                    onOpenAddModal={handleOpenAddModal}
                    onOpenEditModal={handleOpenEditModal}
                    onSave={handleSaveSchedule}
                    currentUserRole={currentUserRole}
                    currentStaffId={currentStaffId}
                  />
                )}
                {activeTab === 'timeline' && (
                  <TimelineView
                    schedules={schedules.filter(s => s.is_transferred === 1)}
                    staff={staff}
                    onOpenEditModal={handleOpenEditModal}
                    currentUserRole={currentUserRole}
                    currentStaffId={currentStaffId}
                    onUpdateResult={handleUpdateScheduleResult}
                    onReorder={handleReorderSchedules}
                  />
                )}
                {currentUserRole === 'admin' && activeTab === 'calendar' && (
                  <CalendarView
                    schedules={schedules}
                    staff={staff}
                    onOpenAddModal={handleOpenAddModal}
                    onOpenEditModal={handleOpenEditModal}
                    onSave={handleSaveSchedule}
                    onDelete={handleDeleteSchedule}
                    workTypes={workTypes}
                    onTransferSchedules={handleTransferSchedules}
                  />
                )}
                {currentUserRole === 'admin' && activeTab === 'master_management' && (
                  <MasterManagementView
                    currentUserRole={currentUserRole}
                    staff={staff}
                    workTypes={workTypes}
                    onRefresh={() => fetchData(false)}
                    userEmail={user?.email || 'system'}
                  />
                )}
                {currentUserRole === 'admin' && activeTab === 'analytics' && (
                  <AnalyticsView
                    schedules={schedules}
                    staff={staff}
                  />
                )}
              </>
            )}
          </main>

          <ScheduleModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            staff={staff}
            selectedDate={selectedDate}
            selectedSchedule={selectedSchedule}
            onSave={handleSaveSchedule}
            onDelete={handleDeleteSchedule}
            workTypes={workTypes}
            currentUserEmail={user?.email || 'system'}
            defaultTransferred={activeTab === 'calendar' ? 0 : 1}
          />

          <PasteImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onImportSuccess={() => fetchData(false)}
            userEmail={user?.email || 'system'}
          />


        </>
      )}
    </div>
  );
}

export default App;

