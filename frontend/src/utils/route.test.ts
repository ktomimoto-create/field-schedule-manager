import { describe, expect, it } from 'vitest'
import type { Schedule } from '../types'
import { isSameSite, sameBuilding, siteKey, travelLeg } from './route'

const at = (property_name: string) => ({ property_name }) as Schedule

describe('siteKey / sameBuilding', () => {
  it('同じ団地の数字の棟は同じ敷地（ヌーヴェル赤羽台 5号棟と 13号棟）', () => {
    expect(siteKey(at('ヌーヴェル赤羽台　５号棟'))).toBe('ヌーヴェル赤羽台')
    expect(sameBuilding(at('ヌーヴェル赤羽台　５号棟'), at('ヌーヴェル赤羽台１３号棟'))).toBe(true)
  })

  it('A制御・B棟・括弧書き・丸数字も今までどおり外す', () => {
    expect(sameBuilding(at('プラウドタワー池袋（A制御）'), at('プラウドタワー池袋（B制御）'))).toBe(true)
    expect(siteKey(at('ザ・パークハウス 武蔵小杉タワーズ　サウス棟A制御'))).toBe('ザ・パークハウス武蔵小杉タワーズサウス棟')
    expect(siteKey(at('東京メガシティ　コンフォートタワー②'))).toBe('東京メガシティコンフォートタワー')
  })

  it('名前が違う物件は別', () => {
    expect(sameBuilding(at('ヌーヴェル赤羽台　５号棟'), at('グローベルガーデン豊田ディーセントスクエア'))).toBe(false)
  })
})

describe('近い物件どうしの移動', () => {
  // 緯度 0.0009 度 ≒ 100m
  const base = { lat: 35.7765, lng: 139.7136 }
  const north = (m: number) => ({ lat: base.lat + (m / 100) * 0.0009, lng: base.lng })

  it('100m 以内は同じ場所（重ねて、移動なし）', () => {
    expect(isSameSite(base, north(80))).toBe(true)
    expect(travelLeg(base, north(80), 'transit')).toEqual({ min: 0, kind: 'same' })
  })

  it('200m 以内は隣（歩きの時間だけで、余裕の 10 分を足さない。車の人も歩く）', () => {
    const leg = travelLeg(base, north(150), 'car')
    expect(leg.kind).toBe('walk')
    expect(leg.min).toBeLessThan(10)
  })

  it('200m を超えると今までどおり余裕の 10 分を足す', () => {
    expect(travelLeg(base, north(300), 'transit').min).toBeGreaterThanOrEqual(10)
  })
})
