import React, { useState, useMemo } from 'react';
import type { Schedule, Staff } from '../types';
import { BarChart3, Users, MapPin, Calendar, Award } from 'lucide-react';
import './AnalyticsView.css';

interface AnalyticsViewProps {
  schedules: Schedule[];
  staff: Staff[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ schedules, staff }) => {
  // 利用可能な月の一覧を抽出 (例: 2026-06)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    schedules.forEach(s => {
      if (s.date && s.date.length >= 7) {
        months.add(s.date.substring(0, 7));
      }
    });
    // 現在の月がなければ追加
    const currentMonth = new Date().toISOString().substring(0, 7);
    months.add(currentMonth);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [schedules]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    return availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0];
  });

  // 対象月の予定
  const monthSchedules = useMemo(() => {
    return schedules.filter(s => 
      s.date && s.date.startsWith(selectedMonth) && 
      s.work_type !== '休暇' &&
      s.status !== 'cancelled'
    );
  }, [schedules, selectedMonth]);

  // 総対応件数・完了件数・未完了件数
  const stats = useMemo(() => {
    const total = monthSchedules.length;
    const completed = monthSchedules.filter(s => s.result === '完了').length;
    const working = monthSchedules.filter(s => s.result === '作業中').length;
    const incomplete = total - completed - working;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, working, incomplete, completionRate };
  }, [monthSchedules]);

  // 1. 種別 (work_type) の集計
  const workTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    monthSchedules.forEach(s => {
      const type = s.work_type || '一般';
      counts[type] = (counts[type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthSchedules]);

  // 2. スタッフ別の集計
  const staffData = useMemo(() => {
    const counts: Record<number, number> = {};
    const unassignedCount = { count: 0 };

    monthSchedules.forEach(s => {
      if (s.staff_id) {
        counts[s.staff_id] = (counts[s.staff_id] || 0) + 1;
      } else {
        unassignedCount.count += 1;
      }
    });

    const list = staff.map(st => {
      return {
        name: st.name,
        value: counts[st.id] || 0,
      };
    }).filter(item => item.value > 0);

    if (unassignedCount.count > 0) {
      list.push({ name: '（未割り当て）', value: unassignedCount.count });
    }

    return list.sort((a, b) => b.value - a.value);
  }, [monthSchedules, staff]);

  // 3. エリア別の集計
  const areaData = useMemo(() => {
    const counts: Record<string, number> = {};
    monthSchedules.forEach(s => {
      const area = s.area || 'その他/未設定';
      counts[area] = (counts[area] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // 上位10エリアを表示
  }, [monthSchedules]);

  // グラフ描画用の最大値の取得
  const maxWorkTypeValue = useMemo(() => Math.max(...workTypeData.map(d => d.value), 1), [workTypeData]);
  const maxStaffValue = useMemo(() => Math.max(...staffData.map(d => d.value), 1), [staffData]);
  const maxAreaValue = useMemo(() => Math.max(...areaData.map(d => d.value), 1), [areaData]);

  // 和風の月表示
  const formatJapaneseMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年 ${parseInt(month)}月`;
  };

  return (
    <div className="analytics-container card">
      <div className="analytics-header">
        <div className="analytics-title-area">
          <BarChart3 className="icon-purple" size={24} />
          <h2>実績集計・稼働分析</h2>
        </div>

        <div className="month-picker-container">
          <Calendar size={16} className="text-muted" />
          <select 
            className="form-control month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{formatJapaneseMonth(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="analytics-summary-grid">
        <div className="summary-stat-card">
          <span className="summary-card-label">総作業対応数</span>
          <span className="summary-card-value">{stats.total} <span className="unit">件</span></span>
        </div>
        <div className="summary-stat-card success-card">
          <span className="summary-card-label">完了件数</span>
          <span className="summary-card-value text-success">{stats.completed} <span className="unit">件</span></span>
        </div>
        <div className="summary-stat-card warning-card">
          <span className="summary-card-label">対応中 (ステータス作業中)</span>
          <span className="summary-card-value text-warning">{stats.working} <span className="unit">件</span></span>
        </div>
        <div className="summary-stat-card completion-card">
          <span className="summary-card-label">作業完了率</span>
          <div className="completion-rate-area">
            <span className="summary-card-value">{stats.completionRate} <span className="unit">%</span></span>
            <div className="mini-progress-track">
              <div className="mini-progress-bar" style={{ width: `${stats.completionRate}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* グラフエリア */}
      <div className="charts-flex-grid">
        
        {/* 種別別集計 */}
        <div className="chart-box">
          <div className="chart-box-header">
            <Award size={18} className="text-muted" />
            <h3>対応種別別の件数</h3>
          </div>
          <div className="chart-content">
            {workTypeData.length === 0 ? (
              <div className="empty-chart-msg">データがありません</div>
            ) : (
              workTypeData.map(d => {
                const ratio = Math.round((d.value / maxWorkTypeValue) * 100);
                return (
                  <div key={d.name} className="chart-row">
                    <div className="chart-row-label" title={d.name}>{d.name}</div>
                    <div className="chart-row-bar-wrapper">
                      <div className="chart-row-bar-track">
                        <div className="chart-row-bar fill-purple" style={{ width: `${ratio}%` }}></div>
                      </div>
                    </div>
                    <div className="chart-row-value">{d.value} <span className="unit">件</span></div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* スタッフ別集計 */}
        <div className="chart-box">
          <div className="chart-box-header">
            <Users size={18} className="text-muted" />
            <h3>担当スタッフ別の件数</h3>
          </div>
          <div className="chart-content">
            {staffData.length === 0 ? (
              <div className="empty-chart-msg">データがありません</div>
            ) : (
              staffData.map(d => {
                const ratio = Math.round((d.value / maxStaffValue) * 100);
                return (
                  <div key={d.name} className="chart-row">
                    <div className="chart-row-label" title={d.name}>{d.name}</div>
                    <div className="chart-row-bar-wrapper">
                      <div className="chart-row-bar-track">
                        <div className="chart-row-bar fill-green" style={{ width: `${ratio}%` }}></div>
                      </div>
                    </div>
                    <div className="chart-row-value">{d.value} <span className="unit">件</span></div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* エリア別集計 */}
        <div className="chart-box">
          <div className="chart-box-header">
            <MapPin size={18} className="text-muted" />
            <h3>エリア別の件数 (上位10)</h3>
          </div>
          <div className="chart-content">
            {areaData.length === 0 ? (
              <div className="empty-chart-msg">データがありません</div>
            ) : (
              areaData.map(d => {
                const ratio = Math.round((d.value / maxAreaValue) * 100);
                return (
                  <div key={d.name} className="chart-row">
                    <div className="chart-row-label" title={d.name}>{d.name}</div>
                    <div className="chart-row-bar-wrapper">
                      <div className="chart-row-bar-track">
                        <div className="chart-row-bar fill-pink" style={{ width: `${ratio}%` }}></div>
                      </div>
                    </div>
                    <div className="chart-row-value">{d.value} <span className="unit">件</span></div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
