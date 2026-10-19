import { useEffect, useState } from 'react';

// その日に車を使う人。この人の移動は車で見積もる（それ以外は電車・バスと徒歩）。
// 判断は FE動態（fe-dotai）のアルコールチェックと同じ:
//   ・Fun-navi に載っている車 … その日に Fun-navi の予約がある人だけ（利用目的の名前、無ければその車の基本利用者）
//   ・Fun-navi に無い車（専用車・自家用車）… 基本利用者が毎日使う（daily_exempt の車は除く）
// 正本は fe-dotai の fd_ac_vehicles / fd_ac_reservations。予定管理側の DB に移すまでの間、車両はここに写す（2026-10-19 時点）。

/** Fun-navi に無い車の基本利用者（毎日、車）。「FR」は FR の共用車（担当名が FR で始まる人） */
export const DEDICATED_VEHICLE_USERS: string[] = ['FR', '中川', '丸山', '塙', '小山', '川村', '本間', '畦崎', '藤崎', '阿部', '高橋'];

/** Fun-navi に載っている車（施設名の一部 → 基本利用者）。予約の利用目的に名前が無いときに使う */
const FUNNAVI_VEHICLES: { key: string; baseUser: string }[] = [
  { key: 'NV100110', baseUser: 'FR' },
  { key: 'ハイゼット3452', baseUser: 'FR' },
  { key: 'N-BOX655', baseUser: '丸山' },
  { key: 'プレオプラス150', baseUser: '佐藤' },
  { key: 'プレオプラス160', baseUser: '原' },
  { key: 'エヴリィ8223', baseUser: '吉沼' },
  { key: 'アクア4227', baseUser: '山内' },
  { key: 'ピクシスバン9082', baseUser: '平本' },
  { key: 'プレオ4450', baseUser: '松下' },
  { key: 'NV100140', baseUser: '築地' },
  { key: 'NV100100', baseUser: '藤井' },
  { key: 'NV100120', baseUser: '藤田' },
  { key: 'NV100130', baseUser: '阿部' },
  { key: 'アルト5197', baseUser: '高倉' },
];

export interface FunnaviReservation {
  facility: string;
  purpose: string;
}

const compact = (s: string) => s.replace(/\s/g, '');
const surname = (name: string) => name.trim().split(/\s+/)[0];
const matches = (staffName: string, user: string) => {
  const n = compact(staffName);
  return !!user && (surname(staffName) === user || n.startsWith(user));
};

/** その日に車を使う人か。reservations が null（予約が読めない）のときは専用車の人だけ車。
 *  knownSurnames は担当者全員の苗字（利用目的に誰かの名前が書いてあるかを見分けるため） */
export const usesVehicle = (staffName: string | null | undefined, reservations: FunnaviReservation[] | null, knownSurnames: string[]): boolean => {
  if (!staffName) return false;
  if (DEDICATED_VEHICLE_USERS.some(u => matches(staffName, u))) return true;
  if (!reservations) return false;
  const sn = surname(staffName);
  return reservations.some(r => {
    const purpose = compact(r.purpose || '');
    const named = knownSurnames.filter(k => k && purpose.includes(k));
    // 利用目的に名前があればその人たち、無ければその車の基本利用者（fe-dotai と同じ）
    if (named.length > 0) return named.includes(sn);
    const v = FUNNAVI_VEHICLES.find(x => r.facility.includes(x.key));
    return !!v && matches(staffName, v.baseUser);
  });
};

/** その日の Fun-navi の予約。いまはお試しモード用の写し（public/_sandbox/<日付>.reservations.json）だけ読める。
 *  予定管理側に予約を取り込むまでは、無ければ null（専用車の人だけ車） */
export const useFunnaviReservations = (date: string): FunnaviReservation[] | null => {
  const [state, setState] = useState<{ date: string; list: FunnaviReservation[] | null } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    fetch(`/_sandbox/${date}.reservations.json`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then((json: { reservations?: FunnaviReservation[] } | null) => {
        if (!cancelled) setState({ date, list: json?.reservations ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ date, list: null });
      });
    return () => {
      cancelled = true;
    };
  }, [date]);
  return state?.date === date ? state.list : null;
};
