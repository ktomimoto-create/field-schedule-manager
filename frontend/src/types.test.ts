import { describe, expect, it } from 'vitest'
import { findScheduleStaff, findStaffByName, type Staff } from './types'

const staff: Staff[] = [
  { id: 50, name: '原 拓平', role: 'manager', is_active: 0 },
  { id: 5, name: '原 悠介', role: 'staff', is_active: 1 },
  { id: 61, name: '高田晴規', role: 'staff', is_active: 1 },
  { id: 70, name: '杉山 一郎', role: 'staff', is_active: 0 },
  { id: 71, name: '杉山 二郎', role: 'manager', is_active: 1 },
]

describe('findStaffByName', () => {
  it('苗字が複数の人に当たるときは、現役の現地対応者を選ぶ（名簿の順ではない）', () => {
    expect(findStaffByName(staff, '原')?.id).toBe(5)
  })

  it('現役の現地対応者がいなければ、現役の人を選ぶ', () => {
    expect(findStaffByName(staff, '杉山')?.id).toBe(71)
  })

  it('氏名まで書いてあれば、現役でなくてもその人を選ぶ', () => {
    expect(findStaffByName(staff, '原 拓平')?.id).toBe(50)
    expect(findStaffByName(staff, '原拓平')?.id).toBe(50)
  })

  it('1 人にしか当たらない苗字はそのまま選ぶ', () => {
    expect(findStaffByName(staff, '高田')?.id).toBe(61)
  })

  it('名簿に無い名前は選ばない', () => {
    expect(findStaffByName(staff, 'アンドアンビエンス阿部')).toBeUndefined()
  })
})

describe('findScheduleStaff', () => {
  const roster: Staff[] = [
    { id: 22, name: '清水 孔達', role: 'staff', is_active: 1 },
    { id: 29, name: 'FR岡崎', role: 'staff', is_active: 1 },
  ]

  it('委託の行の苗字だけの名前は、自社の FE に結び付けない（委託先の別人）', () => {
    expect(findScheduleStaff(roster, { staff_id: null, staff_name: '清水', division: '委託' })).toBeUndefined()
  })

  it('委託の行でも、名簿の名前と完全に一致すればその人', () => {
    expect(findScheduleStaff(roster, { staff_id: null, staff_name: 'FR岡崎', division: '委託' })?.id).toBe(29)
  })

  it('委託以外の行は苗字だけでも名簿の人に当てる', () => {
    expect(findScheduleStaff(roster, { staff_id: null, staff_name: '清水', division: 'FTS' })?.id).toBe(22)
  })

  it('担当の ID があればそれを使う', () => {
    expect(findScheduleStaff(roster, { staff_id: 22, staff_name: '清水', division: '委託' })?.id).toBe(22)
  })
})
