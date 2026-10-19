// 車両の基本利用者（苗字）。この人の移動は車で見積もる（それ以外は電車・徒歩）。
// 正本は FE動態（fe-dotai）の車両管理表 fd_ac_vehicles.base_user。
// 予定管理側の DB に車両の表を移すまでの間、ここに写す（空のあいだは予定の「交通手段」欄だけで判断する）。
export const VEHICLE_BASE_USERS: string[] = [];

const surname = (name: string) => name.trim().split(/\s+/)[0];

export const usesVehicle = (staffName: string | null | undefined): boolean => {
  if (!staffName) return false;
  const s = surname(staffName);
  return VEHICLE_BASE_USERS.some(u => u && (u === s || staffName.replace(/\s/g, '').startsWith(u)));
};
