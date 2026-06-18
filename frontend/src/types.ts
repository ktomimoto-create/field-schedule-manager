export interface Staff {
  id: number;
  name: string;
  email?: string;
  default_course?: string;
  is_active?: number;
  role?: string;
  avatar_url?: string; // Microsoftアカウント等から流用するプロフィール画像URL
  employee_code?: string; // 社員番号
}

export type ScheduleStatus = 'free' | 'draft' | 'confirmed' | 'cancelled';

export interface Schedule {
  id: number | string;
  status: ScheduleStatus; // 'free' (通常) | 'draft' (仮予定) | 'confirmed' (確定予定) | 'cancelled' (キャンセル)
  division: string | null; // 区分 (FTSなど)
  type: string | null; // タイプ (WD-D, WD-O C, KU, PU等)
  box: string | null; // BOX
  unit_number: string | null; // 号機
  property_name: string; // 物件名
  work_type: string | null; // 種別 (定期, 保守, 工事, 障害対応など)
  description: string | null; // 作業内容
  target_time: string | null; // 指定時間 (必ず, 10:00, PM, AMなど)
  date: string; // 予定日 (YYYY-MM-DD)
  staff_id: number | null; // 対応者ID
  area: string | null; // エリア
  prefecture: string | null; // 県別
  transport: string | null; // 移動手段
  co_worker: string | null; // 同行者
  request_number: string | null; // 依頼番号 (旧他部署等)
  time_limit: string | null; // TIME
  course: string | null; // コース
  result: string | null; // 結果 (完了, 空欄など)
  started_at?: string | null; // 開始時刻 (HH:MM)
  completed_at?: string | null; // 完了時刻 (HH:MM)
  notes: string | null; // 備考
  report_notes?: string | null; // 対応報告メモ
  disorder_type: string | null; // 障害区分
  is_transferred?: number; // 行動予定表へ移行済みフラグ
  level: string | null; // レベル
  level_3: string | null; // レベル3
  sort_order?: number;
  created_at: string;
  updated_at: string;
  staff_name?: string;
  staff_email?: string;
  staff_course?: string;
  staff_color?: string;
}

export interface AuditLog {
  id: number;
  schedule_id: number | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string;
  property_name: string | null;
  details: string;
  timestamp: string;
}

export interface WorkType {
  id: number;
  name: string;
  is_internal: number;
  sort_order?: number;
}

declare module 'xlsx-js-style';

export const getShortName = (name: string | null | undefined): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (
    trimmed.includes('ナルマンダフ') ||
    trimmed.includes('フスレンバヤル') ||
    trimmed.includes('フーギー')
  ) {
    return 'フーギー';
  }
  // 全角スペースまたは半角スペースでスプリット
  const parts = trimmed.split(/[\s　]+/);
  return parts[0] || trimmed;
};


