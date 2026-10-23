import type { Schedule, Staff } from '../types'

// テスト用の予定・スタッフ。必要な項目だけ上書きして使う
export const makeSchedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 1,
  status: 'confirmed',
  division: null,
  type: null,
  box: null,
  unit_number: null,
  property_name: '物件A',
  work_type: '定期',
  description: null,
  target_time: null,
  date: '2026-10-16',
  staff_id: 1,
  area: '江東区',
  prefecture: '23',
  transport: null,
  co_worker: null,
  request_number: null,
  time_limit: null,
  course: null,
  result: null,
  started_at: null,
  completed_at: null,
  notes: null,
  disorder_type: null,
  level: null,
  level_3: null,
  is_transferred: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

export const makeStaff = (overrides: Partial<Staff> = {}): Staff => ({
  id: 1,
  name: '佐藤 太郎',
  default_course: '1',
  is_active: 1,
  role: 'staff',
  ...overrides,
})
