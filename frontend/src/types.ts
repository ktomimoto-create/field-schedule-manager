// アクセス権限の3段階: staff=現地対応者(閲覧+自分の予定の結果報告) / manager=予定管理者(配車・予定編集) / developer=開発者(全機能)
export type UserRole = 'staff' | 'manager' | 'developer';

// DB の role 文字列を UserRole に正規化（旧値 admin/user もマッピング）
export const normalizeRole = (role: string | null | undefined): UserRole => {
  if (role === 'developer' || role === 'admin') return 'developer';
  if (role === 'manager') return 'manager';
  return 'staff';
};

// 予定の追加・編集・配車操作が可能か（予定管理者以上）
export const canManageSchedules = (role?: UserRole | null): boolean =>
  role === 'developer' || role === 'manager';

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
  created_by?: string | null;
  updated_by?: string | null;
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

  // 既知の苗字リストから前方一致で切り出す（スペースがない本名にも対応）
  const SURNAMES = [
    '平本', '築地', '藤井', '神崎', '原', '土橋', '藤田', '佐藤', '吉沼', '小山', 
    '高橋', '畦崎', '松下', '淺沼', '山内', '中川', '阿部', '藤崎', '本間', '丸山', 
    '清水', '塙', '伊比', '石山', '平井', '豊見本', '富本', '池宮', '高倉'
  ];
  const matchedSurname = SURNAMES.find(s => trimmed.startsWith(s));
  if (matchedSurname) {
    return matchedSurname;
  }

  // 全角スペースまたは半角スペースでスプリット
  const parts = trimmed.split(/[\s　]+/);
  return parts[0] || trimmed;
};

export const toHalfWidth = (str: string | null | undefined): string => {
  if (!str) return '';
  return String(str)
    .replace(/[Ａ-Ｚａ-ｚ０-９：]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    })
    .replace(/　/g, ' ')
    .replace(/[〜～]/g, '~')
    .replace(/[―−]/g, '-')
    .trim();
};

export const cleanMetadata = (val: string | null | undefined): string => {
  if (!val) return '';
  return String(val)
    .replace(/\s*\[__parent_id:\d+__\]/g, '')
    .replace(/\s*\[__no_sync__\]/g, '')
    .trim();
};

export const findStaffByName = (staff: Staff[], name: string | null | undefined): Staff | undefined => {
  if (!name) return undefined;
  const cleanName = name.trim();
  
  if (
    cleanName.includes('フーギー') ||
    cleanName.includes('ナルマンダフ') ||
    cleanName.includes('フスレンバヤル')
  ) {
    return staff.find(st => 
      st.name.includes('ナルマンダフ') || 
      st.name.includes('フスレンバヤル') || 
      st.name.includes('フーギー')
    );
  }
  
  let matched = staff.find(st => st.name.trim() === cleanName);
  if (matched) return matched;
  
  matched = staff.find(st => getShortName(st.name) === getShortName(cleanName));
  if (matched) return matched;

  return undefined;
};

/**
 * 同行者文字列をスタッフ名単位に正しく分割するヘルパー
 * 「阿部 光男」などの姓名間にスペースがある場合でも、1人のスタッフとして認識して不当な分割を防ぐ
 */
export const splitCoWorkers = (coWorkersStr: string | null | undefined, staffList?: Staff[]): string[] => {
  if (!coWorkersStr) return [];
  const trimmed = coWorkersStr.trim();
  if (!trimmed) return [];

  // カンマ、読点、スラッシュ、改行、セミコロンでまず分割
  const primaryTokens = trimmed.split(/[,，、/\n;；]+/).map(s => s.trim()).filter(Boolean);

  const result: string[] = [];

  for (const token of primaryTokens) {
    if (!staffList || staffList.length === 0) {
      const subTokens = token.split(/[\s　]+/).filter(Boolean);
      result.push(...subTokens);
      continue;
    }

    // トークン全体が1人のスタッフとしてマッチするか判定（例: "阿部 光男"）
    if (findStaffByName(staffList, token)) {
      result.push(token);
      continue;
    }

    // 空白で区切られている場合、前から貪欲にスタッフ名とマッチするか判定
    const parts = token.split(/[\s　]+/).filter(Boolean);
    if (parts.length <= 1) {
      result.push(token);
      continue;
    }

    let i = 0;
    while (i < parts.length) {
      // 2単語結合でスタッフに合致するか判定（例: "阿部" + "光男"）
      if (i + 1 < parts.length) {
        const twoWords = `${parts[i]} ${parts[i + 1]}`;
        const twoWordsNoSpace = `${parts[i]}${parts[i + 1]}`;
        if (findStaffByName(staffList, twoWords) || findStaffByName(staffList, twoWordsNoSpace)) {
          result.push(twoWords);
          i += 2;
          continue;
        }
      }

      result.push(parts[i]);
      i += 1;
    }
  }

  return result;
};


