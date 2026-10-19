import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Circle, Clock, Coffee, LocateFixed, LogIn, LogOut, Navigation, Wrench, type LucideIcon } from 'lucide-react';
import type { Schedule, Staff, UserRole } from '../types';
import { compareSchedules, getShortName, normalizeTargetTime } from '../types';
import { buildDayState, FE_EVENT_LABELS, jstDate, jstHm, type FeEvent, type FePosition, type VisitStage } from '../utils/feEvents';
import { fetchAddressesByUnit, geocodeAddress, reverseGeocode, type LatLng } from '../utils/geocode';
import { StaffAvatar } from './ScheduleCards';
import { MapCanvas, type MapCanvasHandle, type MapPin } from './MapCanvas';
import { TimelineView } from './TimelineView';
import './DynamicsMapView.css';

// 動態管理（FE動態 #/map を移したもの）: 左に担当ごとの訪問カード（たためる・状態と完了件数つき）、右に地図。
// FE の位置は、FE画面でボタンを押したときの位置（いちばん新しいもの）。訪問先は物件マスタの住所から置く。

type Status = 'off' | 'ready' | 'moving' | 'working' | 'waiting' | 'done';

const STATUS: Record<Status, { label: string; icon: LucideIcon; color: string }> = {
  off: { label: '勤務前', icon: Circle, color: '#94a3b8' },
  ready: { label: '準備中', icon: LogIn, color: '#6366f1' },
  moving: { label: '移動中', icon: Navigation, color: '#2563eb' },
  working: { label: '作業中', icon: Wrench, color: '#0891b2' },
  waiting: { label: '待機', icon: Coffee, color: '#d97706' },
  done: { label: '勤務終了', icon: LogOut, color: '#059669' },
};
const STATUS_ORDER: Status[] = ['moving', 'working', 'waiting', 'ready', 'off', 'done'];

const STAGE_COLOR: Record<VisitStage, string> = { todo: '#94a3b8', moving: '#2563eb', working: '#0891b2', done: '#059669' };

interface Person {
  key: string;
  member?: Staff;
  name: string;
  visits: Schedule[];
  events: FeEvent[];
  status: Status;
  pos: (LatLng & { at: string }) | null;
  doneCount: number;
}

interface Props {
  schedules: Schedule[];
  staff: Staff[];
  feEvents: FeEvent[];
  /** 画面を開いている間に送った位置（いちばん新しいもの） */
  fePositions?: FePosition[];
  isSandbox: boolean;
  /** 見ている日（App で共通に持つ）。今日以外は予定と記録だけ（今の位置は出さない） */
  date?: string;
  onDateChange?: (date: string) => void;
  /** 担当ごとのカード（予定表の「担当ごと」をここへ移した）で使う */
  currentUserRole: UserRole;
  currentStaffId: number | null;
  onOpenEditModal: (s: Schedule) => void;
  onUpdateResult: (scheduleId: number | string, result: string, startedAt?: string | null, completedAt?: string | null, reportNotes?: string | null) => Promise<void>;
  onReorder: (orders: { id: number | string; sort_order: number }[]) => Promise<void>;
}

const statusOf = (events: FeEvent[]): Status => {
  const last = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).pop();
  if (!last) return 'off';
  return ({ shift_start: 'ready', depart: 'moving', arrive: 'working', finish: 'waiting', shift_end: 'done' } as const)[last.kind];
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const DynamicsMapView: React.FC<Props> = ({ schedules, staff, feEvents, fePositions = [], isSandbox, date, onDateChange, currentUserRole, currentStaffId, onOpenEditModal, onUpdateResult, onReorder }) => {
  const realToday = jstDate();
  const today = date ?? realToday;
  const shiftDay = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    onDateChange?.(d.toISOString().slice(0, 10));
  };
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [addrByPos, setAddrByPos] = useState<Record<string, string | null>>({});
  const [sitePos, setSitePos] = useState<Record<string, LatLng | null>>({});
  const [geoProgress, setGeoProgress] = useState<{ done: number; total: number } | null>(null);

  const people = useMemo<Person[]>(() => {
    const todays = schedules.filter(s => s.is_transferred === 1 && s.date === today && s.work_type !== '休暇' && s.status !== 'cancelled');
    const evToday = feEvents.filter(e => e.work_date === today);
    const map = new Map<string, Person>();
    const ensure = (member: Staff | undefined, name: string) => {
      const key = member ? `id-${member.id}` : `name-${name}`;
      if (!map.has(key)) map.set(key, { key, member, name: member?.name || name, visits: [], events: [], status: 'off', pos: null, doneCount: 0 });
      return map.get(key)!;
    };
    for (const s of todays) {
      if (!s.staff_id && !s.staff_name) continue;
      const member = staff.find(st => st.id === s.staff_id);
      ensure(member, s.staff_name || '').visits.push(s);
    }
    for (const e of evToday) {
      const member = staff.find(st => st.id === e.staff_id);
      if (member) ensure(member, member.name).events.push(e);
    }
    for (const p of map.values()) {
      p.visits.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareSchedules(a, b));
      p.status = statusOf(p.events);
      const located = [...p.events].filter(e => e.lat != null && e.lng != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).pop();
      p.pos = located ? { lat: located.lat!, lng: located.lng!, at: located.occurred_at } : null;
      // 画面を開いている間に送った位置の方が新しければ、そちらを使う（今日の分だけ）
      const live = p.member ? fePositions.find(fp => fp.staff_id === p.member!.id && jstDate(new Date(fp.recorded_at)) === today) : undefined;
      if (live && (!p.pos || live.recorded_at > p.pos.at)) p.pos = { lat: live.lat, lng: live.lng, at: live.recorded_at };
      p.doneCount = buildDayState(p.visits, p.events).visits.filter(v => v.stage === 'done').length;
    }
    const courseOf = (p: Person) => {
      const n = Number(p.member?.default_course);
      return Number.isFinite(n) && String(p.member?.default_course ?? '').trim() !== '' ? n : Infinity;
    };
    return [...map.values()].sort((a, b) => courseOf(a) - courseOf(b) || a.name.localeCompare(b.name, 'ja'));
  }, [schedules, staff, feEvents, fePositions, today]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { off: 0, ready: 0, moving: 0, working: 0, waiting: 0, done: 0 };
    for (const p of people) c[p.status]++;
    return c;
  }, [people]);

  const shown = filter === 'all' ? people : people.filter(p => p.status === filter);
  const selected = people.find(p => p.key === selectedKey) || null;
  const shownIds = useMemo(() => new Set(shown.map(p => p.member?.id).filter((id): id is number => id != null)), [shown]);
  const personById = useMemo(() => new Map(people.filter(p => p.member).map(p => [p.member!.id, p])), [people]);
  // たたんでいる担当
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const toggleCollapsed = (id: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allCollapsed = shownIds.size > 0 && [...shownIds].every(id => collapsed.has(id));

  // カード: カーソルを乗せた人（無ければ選んだ人）の状態・更新時刻・進み具合・現在地
  const cardPerson = people.find(p => p.key === (hoverKey ?? selectedKey)) || null;
  const cardDay = useMemo(() => (cardPerson ? buildDayState(cardPerson.visits, cardPerson.events) : null), [cardPerson]);
  const cardPosKey = cardPerson?.pos ? `${cardPerson.pos.lat.toFixed(4)},${cardPerson.pos.lng.toFixed(4)}` : null;
  useEffect(() => {
    if (!cardPerson?.pos || !cardPosKey || cardPosKey in addrByPos) return;
    let cancelled = false;
    const { lat, lng } = cardPerson.pos;
    void reverseGeocode(lat, lng).then(addr => {
      if (!cancelled) setAddrByPos(prev => ({ ...prev, [cardPosKey]: addr }));
    });
    return () => {
      cancelled = true;
    };
  }, [cardPerson, cardPosKey, addrByPos]);

  // 訪問先の位置（号機 → 住所 → 緯度経度）。少しずつ問い合わせて、分かったものから地図に出す
  const unitsKey = useMemo(() => [...new Set(people.flatMap(p => p.visits.map(v => (v.unit_number || '').trim())).filter(Boolean))].sort().join(','), [people]);
  useEffect(() => {
    if (!unitsKey) return;
    let cancelled = false;
    (async () => {
      const units = unitsKey.split(',');
      const addr = await fetchAddressesByUnit(units);
      const targets = units.filter(u => addr[u]);
      setGeoProgress({ done: 0, total: targets.length });
      let done = 0;
      for (const u of targets) {
        if (cancelled) return;
        const ll = await geocodeAddress(addr[u]);
        done++;
        setSitePos(prev => ({ ...prev, [u]: ll }));
        setGeoProgress({ done, total: targets.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unitsKey]);

  /* ---------- 地図 ---------- */
  const mapRef = useRef<MapCanvasHandle>(null);
  const fittedRef = useRef(false);
  const [mapNote, setMapNote] = useState<string | null>(null);
  // 地図を作り直した回数（Google → 地理院地図に切り替わったら範囲を合わせ直す）
  const [mapGen, setMapGen] = useState(0);

  // ピン: 訪問先（選んだ人は番号つき、それ以外は小さい点）と FE（顔＋苗字。枠の色が状態）
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    for (const p of shown) {
      const day = buildDayState(p.visits, p.events);
      const isSel = p.key === selectedKey;
      day.visits.forEach((v, i) => {
        const ll = sitePos[(v.schedule.unit_number || '').trim()];
        if (!ll) return;
        const color = STAGE_COLOR[v.stage];
        out.push({
          id: `s-${p.key}-${v.schedule.id}`,
          lat: ll.lat,
          lng: ll.lng,
          zIndex: isSel ? 500 : 0,
          html: isSel ? `<div class="dm-site is-selected" style="--c:${color}">${i + 1}</div>` : `<div class="dm-site-dot" style="--c:${color}"></div>`,
          tooltip: `${getShortName(p.name)} ${i + 1}. ${normalizeTargetTime(v.schedule.target_time) || '時間指定なし'}
${v.schedule.unit_number || ''} ${v.schedule.property_name}`,
          onClick: () => setSelectedKey(p.key),
        });
      });
      if (p.pos) {
        const st = STATUS[p.status];
        const face = p.member?.avatar_url ? `<img src="${escapeHtml(p.member.avatar_url)}" alt="" />` : `<span>${escapeHtml(getShortName(p.name).slice(0, 1))}</span>`;
        // 名札（顔＋苗字）の下に矢印。矢印の先が地点
        out.push({
          id: `fe-${p.key}`,
          lat: p.pos.lat,
          lng: p.pos.lng,
          zIndex: 1000,
          html: `<div class="dm-fe${isSel ? ' is-selected' : ''}" style="--c:${st.color}"><div class="dm-fe-tag"><span class="dm-fe-face">${face}</span><span class="dm-fe-name">${escapeHtml(getShortName(p.name))}</span></div><div class="dm-fe-arrow"></div></div>`,
          onHover: on => setHoverKey(on ? p.key : null),
          onClick: () => setSelectedKey(p.key),
        });
      }
    }
    return out;
  }, [shown, sitePos, selectedKey]);

  // 日を変えたら、その日の位置に合わせ直す
  useEffect(() => {
    fittedRef.current = false;
  }, [today]);

  // 訪問先の位置を調べ終わったら、分かっている位置が全部入るように 1 回だけ合わせる
  useEffect(() => {
    if (fittedRef.current) return;
    if (geoProgress && geoProgress.done < geoProgress.total) return;
    const pts = [...people.filter(p => p.pos).map(p => ({ lat: p.pos!.lat, lng: p.pos!.lng })), ...Object.values(sitePos).filter((v): v is LatLng => !!v)];
    if (pts.length === 0) return;
    let tries = 0;
    const tryFit = () => {
      const ok = mapRef.current?.fit(pts, 14);
      if (ok) {
        fittedRef.current = true;
      } else if (tries++ < 20) {
        setTimeout(tryFit, 300); // Google の読み込み待ち
      }
    };
    tryFit();
  }, [people, sitePos, geoProgress, mapGen]);

  const focus = (p: Person) => {
    setSelectedKey(p.key);
    const pts = [
      ...(p.pos ? [{ lat: p.pos.lat, lng: p.pos.lng }] : []),
      ...p.visits.map(v => sitePos[(v.unit_number || '').trim()]).filter((v): v is LatLng => !!v),
    ];
    if (pts.length) mapRef.current?.fit(pts, 15);
  };

  return (
    <div className="dm-view">
      <aside className="dm-side">
        <div className="dm-date">
          <button type="button" className="dm-date-btn" onClick={() => shiftDay(-1)} title="前の日" aria-label="前の日">
            <ChevronLeft size={16} />
          </button>
          <span className="dm-date-label dm-num">{today.replace(/^(\d+)-(\d+)-(\d+)$/, (_, _y, m, d) => `${Number(m)}月${Number(d)}日`)}{today === realToday ? '（今日）' : ''}</span>
          <button type="button" className="dm-date-btn" onClick={() => shiftDay(1)} title="次の日" aria-label="次の日">
            <ChevronRight size={16} />
          </button>
          {today !== realToday && (
            <button type="button" className="dm-date-today" onClick={() => onDateChange?.(realToday)}>今日</button>
          )}
        </div>
        {isSandbox && <div className="dm-note">お試しモードの記録で表示しています</div>}
        <div className="dm-filters" role="group" aria-label="状態で絞り込み">
          <button type="button" className={`dm-chip${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>
            すべて <b className="dm-num">{people.length}</b>
          </button>
          {STATUS_ORDER.map(s => {
            const st = STATUS[s];
            return (
              <button key={s} type="button" className={`dm-chip${filter === s ? ' is-active' : ''}${counts[s] === 0 ? ' is-zero' : ''}`} style={{ ['--c' as string]: st.color }} onClick={() => setFilter(filter === s ? 'all' : s)} title={`${st.label}の人だけ表示`}>
                <i className="dm-dot" />
                {st.label} <b className="dm-num">{counts[s]}</b>
              </button>
            );
          })}
          <button
            type="button"
            className="dm-chip dm-fold-all"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(shownIds))}
            title={allCollapsed ? 'すべて開く' : 'すべてたたむ'}
            aria-label={allCollapsed ? 'すべて開く' : 'すべてたたむ'}
          >
            {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
        </div>

        <div className="dm-list dm-board">
          <TimelineView
            embedded
            collapsible
            schedules={schedules}
            staff={staff}
            staffFilter={m => shownIds.has(m.id)}
            collapsedIds={collapsed}
            onToggleCollapse={toggleCollapsed}
            selectedStaffId={selected?.member?.id ?? null}
            onSelectStaff={id => {
              const p = personById.get(id);
              if (p) focus(p);
            }}
            renderHeaderExtra={m => {
              const p = personById.get(m.id);
              if (!p) return null;
              const st = STATUS[p.status];
              return (
                <span className="dm-head-extra" onMouseEnter={() => setHoverKey(p.key)} onMouseLeave={() => setHoverKey(null)}>
                  <span className="dm-status" style={{ ['--c' as string]: st.color }}>
                    <st.icon size={12} />
                    {st.label}
                  </span>
                  <span className="dm-done dm-num" title="完了 / 今日の訪問">{p.doneCount}/{p.visits.length}</span>
                  <span className="dm-pos" title={p.pos ? `${jstHm(p.pos.at)} の位置` : '位置の記録なし'}>
                    {p.pos ? <LocateFixed size={14} /> : <span className="dm-muted">—</span>}
                  </span>
                </span>
              );
            }}
            onOpenEditModal={onOpenEditModal}
            currentUserRole={currentUserRole}
            currentStaffId={currentStaffId}
            onUpdateResult={onUpdateResult}
            onReorder={onReorder}
            feEvents={feEvents}
            viewDate={today}
            onViewDateChange={onDateChange}
          />
          {shown.length === 0 && <div className="dm-empty">該当する人はいません</div>}
        </div>
      </aside>

      <div className="dm-map-wrap">
        <div className="dm-map">
          <MapCanvas ref={mapRef} pins={pins} onFallback={reason => {
            setMapNote(`${reason}。地理院地図で表示しています`);
            fittedRef.current = false;
            setMapGen(g => g + 1);
          }} />
        </div>
        {cardPerson && cardDay && (() => {
          const st = STATUS[cardPerson.status];
          const last = cardDay.lastEvent;
          const total = cardDay.visits.length;
          const done = cardDay.visits.filter(v => v.stage === 'done').length;
          const nextVisit = cardDay.next?.visit ?? cardDay.visits.find(v => v.stage !== 'done') ?? null;
          const addr = cardPosKey ? addrByPos[cardPosKey] : undefined;
          return (
            <div className="dm-card" style={{ ['--c' as string]: st.color }}>
              <div className="dm-card-head">
                <StaffAvatar member={cardPerson.member} name={cardPerson.name} size={36} />
                <span className="dm-card-name">{cardPerson.name}</span>
                <span className="dm-status">
                  <st.icon size={12} />
                  {st.label}
                </span>
              </div>
              <dl className="dm-card-rows">
                <div>
                  <dt>最終更新</dt>
                  <dd>{last ? <span><b className="dm-num">{jstHm(last.occurred_at)}</b> {FE_EVENT_LABELS[last.kind]}</span> : <span className="dm-muted">まだ記録なし</span>}</dd>
                </div>
                <div>
                  <dt>予定</dt>
                  <dd>
                    <span className="dm-card-progress">
                      <span className="dm-card-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
                      <span><b className="dm-num">{done}/{total}</b> 完了</span>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>次の訪問</dt>
                  <dd>
                    {nextVisit ? (
                      <>
                        <span className="dm-num">{normalizeTargetTime(nextVisit.schedule.target_time) || '時間指定なし'} {nextVisit.schedule.unit_number}</span>
                        <span className="dm-card-prop">{nextVisit.schedule.property_name}</span>
                      </>
                    ) : (
                      <span className="dm-muted">なし</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>現在地</dt>
                  <dd>
                    {cardPerson.pos ? (
                      <>
                        <span>{addr ? addr : addr === null ? '住所を出せませんでした' : '住所を調べています'}</span>
                        <span className="dm-muted dm-num">{jstHm(cardPerson.pos.at)} の位置</span>
                      </>
                    ) : (
                      <span className="dm-muted">位置の記録なし</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })()}
        {mapNote && <div className="dm-map-note">{mapNote}</div>}
        {geoProgress && geoProgress.done < geoProgress.total && (
          <div className="dm-map-badge">
            <Clock size={12} />
            訪問先の位置を調べています <span className="dm-num">{geoProgress.done}/{geoProgress.total}</span>
          </div>
        )}
      </div>
    </div>
  );
};
