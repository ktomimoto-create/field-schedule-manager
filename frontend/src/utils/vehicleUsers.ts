// 車両の基本利用者（苗字）。この人の移動は車で見積もる（それ以外は電車・徒歩）。
// 正本は FE動態（fe-dotai）の車両管理表 fd_ac_vehicles.base_user。
// 予定管理側の DB に車両の表を移すまでの間、ここに写す（2026-10-19 時点。バイクも車として見積もる）。
// 「FR」は FR の共用車（担当名が FR で始まる人に当てる）。
export const VEHICLE_BASE_USERS: string[] = [
  'FR', '中川', '丸山', '佐藤', '原', '吉沼', '塙', '小山', '山内', '川村', '平本', '本間', '松下',
  '畦崎', '築地', '藤井', '藤崎', '藤田', '阿部', '露木', '高倉', '高橋',
];

const surname = (name: string) => name.trim().split(/\s+/)[0];

export const usesVehicle = (staffName: string | null | undefined): boolean => {
  if (!staffName) return false;
  const s = surname(staffName);
  return VEHICLE_BASE_USERS.some(u => u && (u === s || staffName.replace(/\s/g, '').startsWith(u)));
};
