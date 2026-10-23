import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, LogIn, LogOut, MapPin, Navigation, Play, Search, Table2, Undo2, Wrench, type LucideIcon } from 'lucide-react';
import type { Schedule, Staff } from '../types';
import { getShortName, normalizeTargetTime, compareSchedules } from '../types';
import {
  buildDayState,
  FE_EVENT_LABELS,
  getCurrentPositionSafe,
  jstDate,
  jstHm,
  recordFeEvent,
  reportPosition,
  distanceM,
  TRACKING,
  undoLastFeEvent,
  type FeEvent,
  type FeEventKind,
  type PositionFix,
  type VisitStage,
} from '../utils/feEvents';
import { StaffAvatar } from './ScheduleCards';
import './FeActionView.css';

// FE のスマホ画面: 次に押すボタンを 1 つだけ出す（勤務開始 → 出発 → 到着 → 作業完了 → 勤務終了）。
// FE動態（fe-dotai #/fe）を移したもの。押したときの位置も一緒に記録する。

const STAGE: Record<VisitStage, { icon: LucideIcon; label: string }> = {
  todo: { icon: Circle, label: '未着手' },
  moving: { icon: Navigation, label: '移動中' },
  working: { icon: Wrench, label: '作業中' },
  done: { icon: CheckCircle2, label: '完了' },
};

const BUTTON: Record<FeEventKind, { icon: LucideIcon; text: string }> = {
  shift_start: { icon: LogIn, text: '勤務を開始する' },
  depart: { icon: Navigation, text: '出発する' },
  arrive: { icon: MapPin, text: '到着した' },
  finish: { icon: CheckCircle2, text: '作業を完了した' },
  shift_end: { icon: LogOut, text: '勤務を終了する' },
};
// 研修・会議など社内の予定は、出発・到着ではなく「開始」「完了」で進める（開始は到着と同じ記録）
const IN_OFFICE_BUTTON: Partial<Record<FeEventKind, { icon: LucideIcon; text: string }>> = {
  arrive: { icon: Play, text: '開始する' },
  finish: { icon: CheckCircle2, text: '完了する' },
};
const IN_OFFICE_LABEL: Partial<Record<FeEventKind, string>> = { arrive: '開始', finish: '完了' };

interface Props {
  schedules: Schedule[];
  staff: Staff[];
  currentStaffId: number | null;
  isSandbox: boolean;
  /** デモログイン（Supabase のログインなし）。本番の記録は権限で拒否されるので、押す前に案内する */
  isDemoLogin?: boolean;
  feEvents: FeEvent[];
  feUnavailable: boolean;
  onRecorded: () => void;
  /** お試しモードで、到着・完了を予定の開始・完了時刻にも反映する（本番は DB の関数が書く） */
  onUpdateResult: (scheduleId: number | string, result: string, startedAt?: string | null, completedAt?: string | null) => Promise<void>;
  /** 訪問の順番を入れ替える（まだ手を付けていない訪問どうしだけ） */
  onReorder?: (orders: { id: number | string; sort_order: number }[]) => Promise<void>;
  /** 「予定の詳細」: 今日の予定を表で開く（最初は自分の予定だけ） */
  onOpenSchedules?: () => void;
}

export const FeActionView: React.FC<Props> = ({ schedules, staff, currentStaffId, isSandbox, isDemoLogin = false, feEvents, feUnavailable, onRecorded, onUpdateResult, onReorder, onOpenSchedules }) => {
  const [pickedStaffId, setPickedStaffId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastFix, setLastFix] = useState<{ fix: PositionFix | null; at: string } | null>(null);

  // 名簿に自分がいない人（配車担当など）は、お試しモードでだけ担当者を選んで試せる
  const staffId = currentStaffId ?? (isSandbox ? pickedStaffId : null);
  const member = staff.find(s => s.id === staffId);
  const today = jstDate();

  const visits = useMemo(
    () =>
      schedules
        .filter(s => s.is_transferred === 1 && s.date === today && s.staff_id === staffId && s.work_type !== '休暇' && s.status !== 'cancelled')
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b)),
    [schedules, today, staffId]
  );
  const myEvents = useMemo(() => feEvents.filter(e => e.staff_id === staffId && e.work_date === today), [feEvents, staffId, today]);
  const day = useMemo(() => buildDayState(visits, myEvents), [visits, myEvents]);

  // 勤務中は、画面を開いている間の位置も送る（50m 以上動いたか 5 分たったときだけ。精度の悪い測位は捨てる）
  const onShift = !!day.shiftStartAt && !day.shiftEndAt;
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [tracking, setTracking] = useState<'off' | 'on' | 'denied'>('off');
  useEffect(() => {
    if (!onShift || staffId == null || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      pos => {
        setTracking('on');
        if (document.visibilityState !== 'visible') return;
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) };
        if (fix.accuracy_m > TRACKING.maxAccuracyM) return;
        const prev = lastSent.current;
        const now = Date.now();
        if (prev && distanceM(prev, fix) < TRACKING.minMoveM && now - prev.at < TRACKING.heartbeatMs) return;
        lastSent.current = { lat: fix.lat, lng: fix.lng, at: now };
        void reportPosition(staffId, fix, isSandbox).catch(() => { /* 次の測位でまた送る */ });
      },
      err => setTracking(err.code === err.PERMISSION_DENIED ? 'denied' : 'off'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [onShift, staffId, isSandbox]);

  const press = async () => {
    if (!day.next || staffId == null || busy) return;
    const { kind, visit } = day.next;
    setBusy(true);
    try {
      const fix = await getCurrentPositionSafe();
      const ev = await recordFeEvent({ kind, staffId, schedule: visit?.schedule ?? null, position: fix }, isSandbox);
      setLastFix({ fix, at: ev.occurred_at });
      if (isSandbox && visit && (kind === 'arrive' || kind === 'finish')) {
        const hm = jstHm(ev.occurred_at);
        if (kind === 'arrive') await onUpdateResult(visit.schedule.id, visit.schedule.result || '', hm, undefined);
        else await onUpdateResult(visit.schedule.id, '完了', visit.schedule.started_at || hm, hm);
      }
      onRecorded();
    } catch (e) {
      alert(e instanceof Error ? e.message : '記録できませんでした');
    } finally {
      setBusy(false);
    }
  };

  // 順番の入れ替え（まだ手を付けていない訪問どうし。済んだ・対応中の訪問の前には動かさない）
  const move = async (index: number, dir: -1 | 1) => {
    if (!onReorder || busy) return;
    const j = index + dir;
    if (j < 0 || j >= day.visits.length) return;
    if (day.visits[index].stage !== 'todo' || day.visits[j].stage !== 'todo') return;
    const list = day.visits.map(v => v.schedule);
    [list[index], list[j]] = [list[j], list[index]];
    setBusy(true);
    try {
      await onReorder(list.map((s, k) => ({ id: s.id, sort_order: k })));
    } catch (e) {
      alert(e instanceof Error ? e.message : '順番を変えられませんでした');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (staffId == null || busy || !day.lastEvent) return;
    const lastVisit = day.visits.find(v => v.schedule.id === day.lastEvent!.schedule_id);
    const label = (lastVisit?.inOffice && IN_OFFICE_LABEL[day.lastEvent.kind]) || FE_EVENT_LABELS[day.lastEvent.kind];
    if (!window.confirm(`直前の「${label}」（${jstHm(day.lastEvent.occurred_at)}）を取り消しますか？`)) return;
    setBusy(true);
    try {
      const removed = await undoLastFeEvent(staffId, isSandbox);
      if (isSandbox && removed?.schedule_id != null) {
        const sched = schedules.find(s => s.id === removed.schedule_id);
        if (sched && removed.kind === 'arrive') await onUpdateResult(sched.id, sched.result || '', null, undefined);
        if (sched && removed.kind === 'finish') await onUpdateResult(sched.id, '', undefined, null);
      }
      onRecorded();
    } catch (e) {
      alert(e instanceof Error ? e.message : '取り消せませんでした');
    } finally {
      setBusy(false);
    }
  };

  if (staffId == null) {
    if (!isSandbox) {
      return (
        <div className="fe-view">
          <div className="fe-notice">
            このアカウントのメールアドレスが担当者の名簿（スタッフ）に登録されていないため、記録できません。
            右上の「お試しモード」にすると、担当者を選んで試せます。
          </div>
        </div>
      );
    }
    const q = query.trim();
    const candidates = staff.filter(s => s.is_active !== 0 && (!q || s.name.includes(q)));
    return (
      <div className="fe-view">
        <div className="fe-notice is-sandbox">お試しモードです。記録はこの端末の中だけに残り、本番には届きません。</div>
        <div className="fe-picker">
          <div className="fe-search">
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="誰として試すか、名前で検索" />
          </div>
          <div className="fe-picker-list">
            {candidates.map(s => (
              <button key={s.id} type="button" className="fe-picker-item" onClick={() => setPickedStaffId(s.id)}>
                <StaffAvatar member={s} name={s.name} size={28} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const next = day.next;
  const nextButton = next ? (next.visit?.inOffice && IN_OFFICE_BUTTON[next.kind]) || BUTTON[next.kind] : null;
  const NextIcon = nextButton ? nextButton.icon : CheckCircle2;
  const blockedDemo = !isSandbox && isDemoLogin;
  const disabled = busy || (!isSandbox && feUnavailable) || blockedDemo || !next;
  const doneCount = day.visits.filter(v => v.stage === 'done').length;

  return (
    <div className="fe-view">
      {isSandbox && <div className="fe-notice is-sandbox">お試しモードです。記録はこの端末の中だけに残り、本番には届きません。</div>}
      {blockedDemo && (
        <div className="fe-notice is-warn">デモログインでは本番に記録できません。Microsoft アカウントでログインするか、右上の「お試しモード」で試してください。</div>
      )}
      {!isSandbox && feUnavailable && (
        <div className="fe-notice is-warn">データベースの準備（fe_events）がまだのため、記録できません。お試しモードでは試せます。</div>
      )}

      <div className="fe-head">
        <StaffAvatar member={member} name={member?.name || ''} size={36} />
        <div className="fe-head-text">
          <span className="fe-name">{member ? member.name : ''}</span>
          <span className="fe-date">{today.replace(/^(\d+)-(\d+)-(\d+)$/, (_, _y, m, d) => `${Number(m)}月${Number(d)}日`)}の予定</span>
        </div>
        <span className="fe-progress sc-num" title="完了した訪問 / 今日の訪問">{doneCount}/{day.visits.length}</span>
        {onOpenSchedules && (
          <button
            type="button"
            className="fe-icon-btn"
            onClick={onOpenSchedules}
            title="予定の詳細: 今日の予定を表で見る（最初は自分の予定だけ。人のアイコンで全員に切り替え）"
            aria-label="予定の詳細"
          >
            <Table2 size={16} />
          </button>
        )}
        {isSandbox && currentStaffId == null && (
          <button type="button" className="fe-link" onClick={() => setPickedStaffId(null)}>選び直す</button>
        )}
      </div>

      <div className="fe-next">
        {next?.visit ? (
          <div className="fe-next-target">
            <span className="fe-next-caption">{next.visit.stage === 'todo' ? (next.visit.inOffice ? '次の予定' : '次の訪問') : next.visit.inOffice ? 'いまの予定' : 'いまの訪問'}</span>
            <VisitSummary schedule={next.visit.schedule} />
          </div>
        ) : (
          <div className="fe-next-target is-plain">
            {next?.kind === 'shift_start' && '勤務を始めるときに押してください'}
            {next?.kind === 'shift_end' && (day.visits.length ? '今日の訪問はすべて完了しました' : '今日の訪問の予定はありません')}
            {!next && `お疲れさまでした（勤務終了 ${day.shiftEndAt ? jstHm(day.shiftEndAt) : ''}）`}
          </div>
        )}
        <button type="button" className={`fe-big-btn kind-${next?.kind ?? 'none'}`} onClick={press} disabled={disabled}>
          {busy ? <span className="fe-spinner" aria-label="記録中" /> : <NextIcon size={22} />}
          <span>{nextButton ? nextButton.text : '今日の記録は終わりです'}</span>
        </button>
        <div className="fe-next-foot">
          <span className="fe-pos">
            {lastFix && (lastFix.fix ? `位置を記録しました（誤差 約${lastFix.fix.accuracy_m}m）` : '位置は取れませんでした（時刻だけ記録）')}
          </span>
          {day.lastEvent && (
            <button type="button" className="fe-link" onClick={undo} disabled={busy} title="押し間違えたときに、直前の記録を取り消します">
              <Undo2 size={16} />
              取り消す
            </button>
          )}
        </div>
      </div>

      {onShift && tracking !== 'off' && (
        <div className={`fe-tracking is-${tracking}`}>
          {tracking === 'on' && '勤務中は、この画面を開いている間の位置を送っています（画面を消すと止まります）'}
          {tracking === 'denied' && '位置の利用が許可されていません。設定で、このサイトの位置情報を許可してください'}
        </div>
      )}
      <div className="fe-shift">
        <span>勤務開始 <b className="sc-num">{day.shiftStartAt ? jstHm(day.shiftStartAt) : '—'}</b></span>
        <span>勤務終了 <b className="sc-num">{day.shiftEndAt ? jstHm(day.shiftEndAt) : '—'}</b></span>
      </div>

      <ol className="fe-visits">
        {day.visits.map((v, i) => {
          const st = STAGE[v.stage];
          const isTarget = next?.visit?.schedule.id === v.schedule.id;
          return (
            <li key={v.schedule.id} className={`fe-visit stage-${v.stage}${isTarget ? ' is-target' : ''}`}>
              <span className="fe-visit-no sc-num">{i + 1}</span>
              <div className="fe-visit-body">
                <VisitSummary schedule={v.schedule} />
                <div className="fe-visit-times">
                  {!v.inOffice && <span>出発 <b className="sc-num">{v.departAt ? jstHm(v.departAt) : '—'}</b></span>}
                  <span>{v.inOffice ? '開始' : '到着'} <b className="sc-num">{v.arriveAt ? jstHm(v.arriveAt) : v.schedule.started_at || '—'}</b></span>
                  <span>完了 <b className="sc-num">{v.finishAt ? jstHm(v.finishAt) : v.schedule.completed_at || '—'}</b></span>
                </div>
              </div>
              <div className="fe-visit-side">
                <span className={`fe-stage stage-${v.stage}`}>
                  <st.icon size={12} />
                  {st.label}
                </span>
                {onReorder && v.stage === 'todo' && (
                  <span className="fe-move">
                    <button
                      type="button"
                      className="fe-move-btn"
                      onClick={() => void move(i, -1)}
                      disabled={busy || i === 0 || day.visits[i - 1].stage !== 'todo'}
                      title="この訪問を 1 つ前にする"
                      aria-label="1 つ前にする"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      type="button"
                      className="fe-move-btn"
                      onClick={() => void move(i, 1)}
                      disabled={busy || i === day.visits.length - 1}
                      title="この訪問を 1 つ後にする"
                      aria-label="1 つ後にする"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {day.visits.length === 0 && <li className="fe-empty">今日の訪問の予定はありません</li>}
      </ol>
    </div>
  );
};

const VisitSummary: React.FC<{ schedule: Schedule }> = ({ schedule: s }) => {
  const time = normalizeTargetTime(s.target_time);
  return (
    <div className="fe-summary">
      <div className="fe-summary-top">
        <span className={`sc-num fe-time${time === '必ず' ? ' is-must' : ''}`}>{time || '時間指定なし'}</span>
        {s.unit_number && <span className="sc-num fe-unit">{s.unit_number}</span>}
        {s.work_type && <span className="sc-badge">{s.work_type}</span>}
      </div>
      <div className="fe-property">{s.property_name}</div>
      {s.description && <div className="fe-desc">{s.description}</div>}
      {s.co_worker && <div className="fe-co">同行: {s.co_worker.split(/[,、]/).map(n => getShortName(n.trim())).filter(Boolean).join('・')}</div>}
    </div>
  );
};
