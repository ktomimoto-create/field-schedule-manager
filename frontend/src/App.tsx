import { useState, useEffect, useRef } from 'react';
import type { Schedule, Staff, WorkType } from './types';
import { GridView } from './components/GridView';
import { CalendarView } from './components/CalendarView';
import { TimelineView } from './components/TimelineView';
import { MasterManagementView } from './components/MasterManagementView';
import { AnalyticsView } from './components/AnalyticsView';
import { ScheduleModal } from './components/ScheduleModal';
import { PasteImportModal } from './components/PasteImportModal';
import { Calendar, Layers, RefreshCw, AlertCircle, List, Sliders, Sun, Moon, BarChart3 } from 'lucide-react';
import { supabase, talkScriptSupabase } from './supabaseClient';
import './App.css';



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

  // 同期保存（コピペ等）時の採番競合防止用の一時プール (キー: "YYYY-MM-DD", 値: 使用済みコースのSet)
  const tempUsedCoursesRef = useRef<Record<string, Set<number>>>({});


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
        avatar_url: 'https://bvhfmwrjrrqrpqvlzkyd.supabase.co/storage/v1/object/public/avatars/000644_1771487704318.png'
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

  // 監査ログ保存ヘルパー
  const saveAuditLog = async (scheduleId: number | null, action: string, propertyName: string, details: string) => {
    try {
      await supabase.from('audit_logs').insert([
        {
          schedule_id: scheduleId,
          action,
          property_name: propertyName,
          details,
          changed_by: user?.email || 'system'
        }
      ]);
    } catch (err) {
      console.error('Failed to save audit log:', err);
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

      const idVal = typeof scheduleId === 'string' ? Number(scheduleId) : scheduleId;
      const { error: patchError } = await supabase.from('schedules').update(payload).eq('id', idVal);

      if (patchError) {
        throw new Error('結果の更新に失敗しました。');
      }

      // 履歴ログの保存
      const targetSched = schedules.find(s => s.id === idVal);
      await saveAuditLog(
        idVal,
        'update_result',
        targetSched ? targetSched.property_name : '',
        `予定の結果を更新しました: ${resultValue}`
      );

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  const handleReorderSchedules = async (orders: { id: number | string; sort_order: number }[]) => {
    try {
      const promises = orders.map(async (item) => {
        const idVal = typeof item.id === 'string' ? Number(item.id) : item.id;
        return supabase.from('schedules').update({ sort_order: item.sort_order }).eq('id', idVal);
      });

      const results = await Promise.all(promises);
      const hasError = results.some(r => r.error);

      if (hasError) {
        throw new Error('並び順の更新に失敗しました。');
      }

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  const handleTransferSchedules = async (dateStr: string) => {
    try {
      const { error: transferError } = await supabase.from('schedules').update({ is_transferred: 1 }).eq('date', dateStr);

      if (transferError) {
        throw new Error('予定の移行に失敗しました。');
      }

      await saveAuditLog(
        null,
        'transfer',
        `日付: ${dateStr}`,
        `${dateStr} の予定を行動予定表へ移行しました。`
      );

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
      const [schedulesRes, staffRes, workTypesRes, profilesRes] = await Promise.all([
        supabase.from('schedules').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('work_types').select('*').order('sort_order', { ascending: true }),
        talkScriptSupabase.from('profiles').select('email, avatar_url, employee_id')
      ]);

      if (schedulesRes.error || staffRes.error || workTypesRes.error) {
        throw new Error('データの取得に失敗しました。Supabaseの接続設定を確認してください。');
      }

      // 外部プロフィール情報のマップ作成（エラー時は単にスキップ）
      const profilesMapByEmail = new Map<string, string>();
      const profilesMapByEmpCode = new Map<string, string>();
      if (!profilesRes.error && profilesRes.data) {
        profilesRes.data.forEach((p: any) => {
          if (p.avatar_url) {
            if (p.email) {
              profilesMapByEmail.set(p.email.toLowerCase().trim(), p.avatar_url);
            }
            if (p.employee_id) {
              profilesMapByEmpCode.set(String(p.employee_id).trim(), p.avatar_url);
            }
          }
        });
      }

      // PostgreSQLの予定データを型変換して格納
      const schedulesData: Schedule[] = (schedulesRes.data || []).map((s: any) => ({
        ...s,
        id: Number(s.id),
        staff_id: s.staff_id ? Number(s.staff_id) : null
      }));

      const staffData: Staff[] = (staffRes.data || []).map((st: any) => {
        const staffEmail = st.email ? st.email.toLowerCase().trim() : '';
        const empCode = st.employee_code ? String(st.employee_code).trim() : '';
        
        let matchedAvatar = undefined;
        if (empCode) {
          matchedAvatar = profilesMapByEmpCode.get(empCode);
        }
        if (!matchedAvatar && staffEmail) {
          matchedAvatar = profilesMapByEmail.get(staffEmail);
        }

        return {
          ...st,
          id: Number(st.id),
          avatar_url: matchedAvatar || undefined
        };
      });

      const workTypesData: WorkType[] = (workTypesRes.data || []).map((t: any) => ({
        ...t,
        id: Number(t.id)
      }));

      setSchedules(schedulesData);
      setStaff(staffData);
      setWorkTypes(workTypesData);
      // データ更新完了に伴い、一時プールをクリア
      tempUsedCoursesRef.current = {};

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

    try {
      let res;
      const payload = { ...scheduleData };
      delete (payload as any).created_at;
      delete (payload as any).updated_at;

      // FTSのスタッフで、かつコース番号が未設定の場合、27以降の空き番号を自動採番
      const matchedStaff = payload.staff_id 
        ? staff.find(st => st.id === Number(payload.staff_id)) 
        : null;

      const isFtsOrOfficeWorker = matchedStaff && (
        !matchedStaff.default_course || 
        matchedStaff.default_course.trim() === '' ||
        (Number(matchedStaff.default_course) >= 1 && Number(matchedStaff.default_course) <= 26) ||
        (Number(matchedStaff.default_course) >= 27 && Number(matchedStaff.default_course) <= 89)
      );

      if (isFtsOrOfficeWorker && (!payload.course || String(payload.course).trim() === '')) {
        payload.division = 'FTS';
        const targetDate = payload.date;
        if (targetDate) {
          // その日の一時的な使用済みプールを初期化
          if (!tempUsedCoursesRef.current[targetDate]) {
            tempUsedCoursesRef.current[targetDate] = new Set<number>();
          }
          const tempUsed = tempUsedCoursesRef.current[targetDate];

          // 状態(schedules)から既存のFTS予定で使用されているコース番号をスキャン
          const daySchedules = schedules.filter(s => s.date === targetDate && s.division === 'FTS');
          const usedCourses = new Set<number>();
          daySchedules.forEach(s => {
            if (s.course) {
              const cNum = parseInt(s.course, 10);
              if (!isNaN(cNum)) usedCourses.add(cNum);
            }
          });

          // スタッフのデフォルトコース（1〜26）もスキャン
          staff.forEach(st => {
            if (st.default_course) {
              const cNum = parseInt(st.default_course, 10);
              if (!isNaN(cNum) && cNum >= 1 && cNum <= 26) {
                usedCourses.add(cNum);
              }
            }
          });

          // 27から順に空き番号を探す（状態の使用済み + 一時プールの使用済み）
          let autoCourse = 27;
          while (usedCourses.has(autoCourse) || tempUsed.has(autoCourse)) {
            autoCourse++;
          }

          // 一時プールにマーク
          tempUsed.add(autoCourse);

          payload.course = String(autoCourse);
        }
      }


      // 号機 (unit_number) が指定されている場合、物件マスタから自動補完
      if (payload.unit_number && payload.unit_number.trim() !== '') {
        let currentPropertyName = payload.property_name;
        let currentArea = payload.area;
        let currentPrefecture = payload.prefecture;

        if (isEdit) {
          const existing = schedules.find(s => s.id === Number(scheduleData.id));
          if (existing) {
            if (currentPropertyName === undefined) currentPropertyName = existing.property_name;
            if (currentArea === undefined) currentArea = existing.area;
            if (currentPrefecture === undefined) currentPrefecture = existing.prefecture;
          }
        }

        const needsNameAutoFill = !currentPropertyName || currentPropertyName.trim() === '' || currentPropertyName === '（物件名未定）';
        const needsAreaAutoFill = !currentArea || currentArea.trim() === '';
        const needsPrefAutoFill = !currentPrefecture || currentPrefecture.trim() === '';

        if (needsNameAutoFill || needsAreaAutoFill || needsPrefAutoFill) {
          const { data: propData, error: propError } = await supabase
            .from('properties')
            .select('*')
            .eq('unit_number', payload.unit_number.trim())
            .limit(1);

          if (!propError && propData && propData.length > 0) {
            const prop = propData[0];
            
            if (needsNameAutoFill) {
              payload.property_name = prop.property_name;
            }
            
            if (prop.address) {
              const prefs = ['東京', '神奈川', '埼玉', '千葉', '長野'];
              let matchedPref = '';
              let restAddress = prop.address;
              
              for (const p of prefs) {
                if (prop.address.startsWith(p)) {
                  matchedPref = p;
                  restAddress = prop.address.substring(p.length);
                  break;
                }
              }
              
              if (needsPrefAutoFill && matchedPref) {
                payload.prefecture = matchedPref;
              }
              
              if (needsAreaAutoFill) {
                const spaceIdx = restAddress.indexOf(' ');
                const cleanAddress = spaceIdx !== -1 ? restAddress.substring(0, spaceIdx) : restAddress;
                payload.area = cleanAddress;
              }
            }
          }
        }
      }

      if (isEdit) {
        const idVal = Number(payload.id);
        delete payload.id;
        res = await supabase.from('schedules').update(payload).eq('id', idVal);
      } else {
        delete payload.id;
        res = await supabase.from('schedules').insert([payload]);
      }

      if (res.error) {
        throw new Error('予定の保存に失敗しました。');
      }

      // 履歴ログの保存
      await saveAuditLog(
        isEdit ? Number(scheduleData.id) : null,
        isEdit ? 'update' : 'create',
        scheduleData.property_name || '',
        isEdit ? `予定を更新しました: ${JSON.stringify(payload)}` : `予定を新規作成しました: ${JSON.stringify(payload)}`
      );

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      const targetSched = schedules.find(s => s.id === id);
      const res = await supabase.from('schedules').delete().eq('id', id);

      if (res.error) {
        throw new Error('予定の削除に失敗しました。');
      }

      // 履歴ログの保存
      await saveAuditLog(
        id,
        'delete',
        targetSched ? targetSched.property_name : '',
        '予定を削除しました。'
      );

      await fetchData(true); // サイレント更新
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
      throw err;
    }
  };

  const handleClearAllSchedules = async () => {
    try {
      const res = await supabase.from('schedules').delete().neq('id', -1);

      if (res.error) {
        throw new Error(res.error.message || '予定の全削除に失敗しました。');
      }

      // 履歴ログの保存
      await saveAuditLog(
        null,
        'clear_all',
        '全スケジュール',
        'すべてのスケジュールデータを一括削除しました。'
      );

      await fetchData(false);
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

            <div className="header-actions">
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
                    onOpenPasteImportModal={() => setIsImportOpen(true)}
                  />
                )}
                {currentUserRole === 'admin' && activeTab === 'master_management' && (
                  <MasterManagementView
                    currentUserRole={currentUserRole}
                    staff={staff}
                    workTypes={workTypes}
                    onRefresh={() => fetchData(false)}
                    onClearSchedules={handleClearAllSchedules}
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

