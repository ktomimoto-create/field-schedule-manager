import { supabase } from '../supabaseClient';

// 訪問先の位置: 号機 → 物件マスタ（properties）の住所 → 国土地理院の住所検索で緯度経度。
// 結果はこの端末の localStorage に貯めて、同じ住所は 2 度問い合わせない（国土地理院は無料・キー不要）。

export interface LatLng {
  lat: number;
  lng: number;
}

const CACHE_KEY = 'field_app_geocode_cache_v1';

const readCache = (): Record<string, LatLng | null> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCache = (c: Record<string, LatLng | null>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* 保存できなくても動く */ }
};

/** 号機 → 住所（物件マスタ）。まとめて 1 回で引く */
export const fetchAddressesByUnit = async (units: string[]): Promise<Record<string, string>> => {
  const uniq = [...new Set(units.map(u => u.trim()).filter(Boolean))];
  if (uniq.length === 0) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const { data } = await supabase.from('properties').select('unit_number, address').in('unit_number', chunk);
    for (const r of (data || []) as { unit_number: string; address: string | null }[]) {
      if (r.address) out[r.unit_number] = r.address;
    }
  }
  return out;
};

/** 住所 → 緯度経度（国土地理院）。見つからなければ null */
export const geocodeAddress = async (address: string): Promise<LatLng | null> => {
  const key = address.trim();
  if (!key) return null;
  const cache = readCache();
  if (key in cache) return cache[key];
  try {
    const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(key)}`);
    const json = (await res.json()) as { geometry: { coordinates: [number, number] } }[];
    const hit = json[0]?.geometry?.coordinates;
    const val = hit ? { lng: hit[0], lat: hit[1] } : null;
    cache[key] = val;
    writeCache(cache);
    return val;
  } catch {
    return null;
  }
};

const REV_KEY = 'field_app_revgeo_cache_v1';

/** 緯度経度 → 住所（OpenStreetMap の Nominatim。カードを出したときだけ問い合わせ、端末に貯める） */
export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  let cache: Record<string, string | null> = {};
  try {
    cache = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
  } catch { /* noop */ }
  if (key in cache) return cache[key];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ja&lat=${lat}&lon=${lng}`);
    const json = (await res.json()) as { address?: Record<string, string>; display_name?: string };
    const a = json.address || {};
    // 日本の住所の順（都道府県 → 市区町村 → 町名）に組み立てる
    const parts = [a.province || a.state, a.city || a.town || a.village, a.city_district || a.suburb, a.quarter || a.neighbourhood].filter(Boolean);
    const val = parts.length ? parts.join('') : json.display_name || null;
    cache[key] = val;
    try {
      localStorage.setItem(REV_KEY, JSON.stringify(cache));
    } catch { /* noop */ }
    return val;
  } catch {
    return null;
  }
};
