import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Schedule } from '../types';
import { fetchAddressesByUnit, geocodeAddress, type LatLng } from './geocode';
import { parseTimeSlot } from './scheduleDisplay';

// 訪問の順番と移動時間の見積もり。
// 1 件の作業は 60 分。移動は「物件どうしの距離から出した通常の所要時間 ＋ 10 分」。
// 通常の所要時間は直線距離からの見込み（道路・線路の地図は使わない）:
//   車      … 直線 × 1.3 を道のりとし、10km までは時速 25km（都内の一般道）、それを超える分は時速 45km（高速・幹線）
//   電車・徒歩 … 1km 未満は歩き（直線 × 1.3 を時速 4.8km）。それ以上は駅までの歩き 10 分＋待ち 5 分＋電車（直線 × 1.3 を時速 30km）

export const WORK_MIN = 60;
export const MOVE_BUFFER_MIN = 10;
const ROAD_FACTOR = 1.3;
const CAR_KMH = 25;
/** 道のり 10km を超える分は高速・幹線道路を使うとして時速 45km */
const CAR_CITY_KM = 10;
const CAR_FAR_KMH = 45;
const WALK_KMH = 4.8;
const TRAIN_KMH = 30;
const WALK_ONLY_KM = 1;
/** 位置が分からないときの移動（通常 15 分 ＋ 10 分） */
export const MOVE_UNKNOWN_MIN = 15 + MOVE_BUFFER_MIN;

/** 移動の手段: 車両を使う人は車、それ以外は電車・バスと歩き */
export type TravelMode = 'car' | 'transit';
/** 1 区間の移動のしかた（アイコンの出し分けに使う） */
export type LegKind = 'car' | 'train' | 'walk' | 'same' | 'unknown';

const distanceKm = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** 同じ建物とみなす（50m 以内） */
export const isSameSite = (a: LatLng | null | undefined, b: LatLng | null | undefined) => !!a && !!b && distanceKm(a, b) < 0.05;

/** a → b の移動（分は余裕の 10 分を含む）。どちらかの位置が分からなければ 25 分 */
export const travelLeg = (a: LatLng | null | undefined, b: LatLng | null | undefined, mode: TravelMode): { min: number; kind: LegKind } => {
  if (!a || !b) return { min: MOVE_UNKNOWN_MIN, kind: 'unknown' };
  if (isSameSite(a, b)) return { min: 0, kind: 'same' }; // 同じ建物（A/B/C 制御など）は移動なし
  const road = distanceKm(a, b) * ROAD_FACTOR;
  if (mode === 'car') {
    const drive = (Math.min(road, CAR_CITY_KM) / CAR_KMH + Math.max(0, road - CAR_CITY_KM) / CAR_FAR_KMH) * 60;
    return { min: Math.max(5, Math.round(drive)) + MOVE_BUFFER_MIN, kind: 'car' };
  }
  if (road / ROAD_FACTOR < WALK_ONLY_KM) return { min: Math.max(3, Math.round((road / WALK_KMH) * 60)) + MOVE_BUFFER_MIN, kind: 'walk' };
  return { min: 10 + 5 + Math.round((road / TRAIN_KMH) * 60) + MOVE_BUFFER_MIN, kind: 'train' };
};
export const travelMin = (a: LatLng | null | undefined, b: LatLng | null | undefined, mode: TravelMode) => travelLeg(a, b, mode).min;

/** その人のその日の移動手段。予定の「交通手段」に車とあれば車、電車・徒歩・バスとあれば電車、無ければ車両の基本利用者かどうか */
export const travelModeOf = (items: Schedule[], usesVehicle: boolean): TravelMode => {
  const t = items.map(s => s.transport || '').join(' ');
  if (/電車|徒歩|バス|公共/.test(t)) return 'transit';
  if (/車|社用|カー/.test(t)) return 'car';
  return usesVehicle ? 'car' : 'transit';
};

const unitOf = (s: Schedule) => (s.unit_number || '').trim();

/** 出動する拠点。出動の記録に位置が無いとき、1 件目はここから移動する（既定は東京・岩本町） */
export const HOME_BASE_ADDRESS = '東京都千代田区岩本町2丁目10-1';
/** 既定と違う拠点から出る人（苗字 → 住所） */
const HOME_BASE_BY_SURNAME: Record<string, string> = {
  畦崎: '神奈川県横浜市港北区北新横浜1丁目4-7',
  小山: '神奈川県横浜市港北区北新横浜1丁目4-7',
  高橋: '神奈川県横浜市港北区北新横浜1丁目4-7',
};
/** 担当の名前 → 出動する拠点の位置（分かるまで null） */
export const useHomeBase = (): ((staffName: string) => LatLng | null) => {
  const [pos, setPos] = useState<Record<string, LatLng | null>>({});
  useEffect(() => {
    let cancelled = false;
    const addrs = [...new Set([HOME_BASE_ADDRESS, ...Object.values(HOME_BASE_BY_SURNAME)])];
    void Promise.all(addrs.map(async a => [a, await geocodeAddress(a)] as const)).then(list => {
      if (!cancelled) setPos(Object.fromEntries(list));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useCallback(
    (staffName: string) => {
      const surname = staffName.trim().split(/\s+/)[0];
      return pos[HOME_BASE_BY_SURNAME[surname] ?? HOME_BASE_ADDRESS] ?? null;
    },
    [pos]
  );
};

/** 物件名から（A制御）などの括弧書き・末尾の①②／A制御／B棟・空白を外したもの。同じなら同じ建物とみなす（住所が無い新築でも移動なしにする） */
export const siteKey = (s: Schedule) =>
  (s.property_name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[①-⑳]+$/u, '')
    .replace(/\s*[A-ZＡ-Ｚa-z]?(制御|号棟|棟)$/u, '')
    .replace(/\s/g, '');
export const sameBuilding = (a: Schedule | null | undefined, b: Schedule) => !!a && !!siteKey(b) && siteKey(a) === siteKey(b);

/** 号機 → 位置（物件マスタの住所 → 国土地理院）。分かったものから少しずつ返す */
export const useSitePositions = (schedules: Schedule[]) => {
  const [pos, setPos] = useState<Record<string, LatLng | null>>({});
  const unitsKey = useMemo(() => [...new Set(schedules.map(unitOf).filter(Boolean))].sort().join(','), [schedules]);
  // 号機 → 予定の物件名（物件マスタと食い違う号機の住所は使わない）
  const namesRef = useRef<Record<string, string>>({});
  namesRef.current = Object.fromEntries(schedules.filter(x => unitOf(x)).map(x => [unitOf(x), x.property_name || '']));
  useEffect(() => {
    if (!unitsKey) return;
    let cancelled = false;
    (async () => {
      const units = unitsKey.split(',');
      const addr = await fetchAddressesByUnit(units, namesRef.current).catch(() => ({} as Record<string, string>));
      let batch: Record<string, LatLng | null> = {};
      for (let i = 0; i < units.length; i++) {
        if (cancelled) return;
        const u = units[i];
        batch[u] = addr[u] ? await geocodeAddress(addr[u]) : null;
        if (Object.keys(batch).length >= 10 || i === units.length - 1) {
          const b = batch;
          batch = {};
          setPos(prev => ({ ...prev, ...b }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unitsKey]);
  return pos;
};

/** 今の順番で回ったときの移動時間の合計（分。出動の位置が分からなければ 1 件目は 25 分） */
export const totalTravel = (items: Schedule[], posOf: (s: Schedule) => LatLng | null, base: LatLng | null, mode: TravelMode) => {
  let sum = 0;
  let prev = base;
  let prevS: Schedule | null = null;
  items.forEach(s => {
    const p = posOf(s);
    sum += sameBuilding(prevS, s) ? 0 : travelMin(prev, p, mode);
    prev = p ?? prev;
    prevS = s;
  });
  return sum;
};

/** 距離の近い順に並べ替える（時間指定は守る）。
 *  出動の位置（分かれば）から始めて、次に行ける訪問のうち作業を始められる時刻がいちばん早いもの（＝近いもの）を選ぶ。
 *  午前の時刻指定・AM 指定があればそれを 1 件目にし、締切（〜迄・時刻指定・AM/PM の終わり）が迫っている訪問は先に回す。時刻指定の無い、位置が分からない訪問は最後に今の順番のまま */
export const planRoute = (items: Schedule[], posOf: (s: Schedule) => LatLng | null, base: LatLng | null, departMin: number, mode: TravelMode): Schedule[] => {
  // 位置が分からない訪問も、時刻指定があれば時刻どおりに入れる（指定の無いものは最後に今の順番のまま）
  const known = items.filter(s => posOf(s) || parseTimeSlot(s.target_time));
  const unknown = items.filter(s => !posOf(s) && !parseTimeSlot(s.target_time));
  const out: Schedule[] = [];
  let t = departMin;
  let here: LatLng | null = base;
  const rest = [...known];
  let lunch = false;
  while (rest.length) {
    // 昼休憩 60 分（12:00 を過ぎて手が空いたところで取る）
    if (!lunch && t >= 12 * 60) {
      t += 60;
      lunch = true;
    }
    const cand = rest.map((s, idx) => {
      const slot = parseTimeSlot(s.target_time);
      const move = here ? travelMin(here, posOf(s), mode) : MOVE_UNKNOWN_MIN;
      const arrive = t + move;
      const earliest = slot && slot.kind !== 'until' ? slot.from : 0;
      const start = Math.max(arrive, earliest);
      const deadline = !slot ? Infinity : slot.kind === 'at' ? slot.from : slot.to;
      const slack = deadline - (slot?.kind === 'until' || slot?.kind === 'band' ? start + WORK_MIN : start);
      return { s, idx, move, start, deadline, slack };
    });
    // 1 件目: 午前の時刻指定（10:00 など）や AM 指定があれば、いちばん早い指定のものから（その前に入れる予定が無い限り 1 件目）
    if (out.length === 0) {
      const morning = cand
        .map(c => ({ c, slot: parseTimeSlot(c.s.target_time) }))
        .filter(x => x.slot && x.slot.kind !== 'until' && x.slot.from <= 12 * 60)
        .sort((a, b) => a.slot!.from - b.slot!.from || a.c.move - b.c.move || a.c.idx - b.c.idx);
      if (morning.length) {
        const first = morning[0].c;
        out.push(first.s);
        rest.splice(first.idx, 1);
        t = first.start + WORK_MIN;
        here = posOf(first.s) ?? here;
        continue;
      }
    }
    const urgent = cand.filter(c => c.deadline < Infinity && c.slack < WORK_MIN + MOVE_UNKNOWN_MIN).sort((a, b) => a.deadline - b.deadline);
    // 出動の位置が分からない 1 件目は、締切の早いもの → 今の順番の先頭
    const pick = urgent[0]
      ?? (here ? [...cand].sort((a, b) => a.start - b.start || a.move - b.move || a.idx - b.idx)[0]
        : [...cand].sort((a, b) => a.deadline - b.deadline || a.idx - b.idx)[0]);
    out.push(pick.s);
    rest.splice(pick.idx, 1);
    t = pick.start + WORK_MIN;
    here = posOf(pick.s) ?? here;
  }
  return [...out, ...unknown];
};
