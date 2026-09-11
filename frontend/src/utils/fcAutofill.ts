import { supabase } from '../supabaseClient';
import { resolveAddress } from './addressResolver';
import type { Schedule } from '../types';

// 読み取りにもタイムアウトを付ける（無限ハング防止）
const withTimeout = <T,>(p: PromiseLike<T>, ms = 15000): Promise<T> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

/**
 * 依頼番号から FC 同期テーブル (fc_requests) → 物件マスタ (properties) を引き、
 * 未入力の項目だけを埋める更新パッチを返す。
 * - 既に値が入っている項目（「（物件名未定）」は未入力扱い）は上書きしない
 * - fc_requests に無い番号・失敗時は null（呼び出し側は何もしない）
 */
export async function buildFcAutofillPatch(
  refnoRaw: string,
  current: Partial<Schedule>
): Promise<Partial<Schedule> | null> {
  const refno = refnoRaw.trim();
  if (refno === '') return null;

  try {
    const { data, error } = await withTimeout(
      supabase.from('fc_requests').select('*').eq('refno', refno).limit(1)
    );
    if (error || !data || data.length === 0) return null;
    const req = data[0];

    const patch: Partial<Schedule> = {};
    const currentUnit = (current.unit_number || '').trim();
    const unit = currentUnit || (req.unit_number || '');
    if (!currentUnit && req.unit_number) {
      patch.unit_number = req.unit_number;
    }

    const needsName = !current.property_name || current.property_name.trim() === '' || current.property_name === '（物件名未定）';
    const needsArea = !(current.area || '').trim();
    const needsPref = !(current.prefecture || '').trim();
    const needsBox = !(current.box || '').trim();
    const needsType = !(current.type || '').trim();

    // 号機キーで物件マスタを引く（マスタ未登録の新設物件は fc_requests の値で代替）
    let master: any = null;
    if (unit) {
      const res = await withTimeout(
        supabase.from('properties').select('*').eq('unit_number', unit).limit(1)
      );
      if (!res.error && res.data && res.data.length > 0) {
        master = res.data[0];
      }
    }

    const propertyName = master?.property_name || req.property_name;
    const address = master?.address || req.address;

    if (needsName && propertyName) patch.property_name = propertyName;
    if (master) {
      if (needsBox && master.box_count) patch.box = String(master.box_count);
      if (needsType && master.model_type) patch.type = master.model_type;
    }
    if (address) {
      const { area, prefecture } = resolveAddress(address);
      if (needsArea && area) patch.area = area;
      if (needsPref && prefecture) patch.prefecture = prefecture;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  } catch (err) {
    // 補完失敗は入力の妨げにしない
    console.error('Failed to build FC autofill patch:', err);
    return null;
  }
}
