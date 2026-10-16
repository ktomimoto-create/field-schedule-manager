import { describe, expect, it } from 'vitest'
import { estimateTravel } from './estimateTravelTime'

const at = (area: string | null, prefecture: string | null, transport: string | null = null) => ({ area, prefecture, transport })

describe('estimateTravel', () => {
  it('同じエリアは 15 分、同じ県別は 30 分、県別が違えば 60 分', () => {
    expect(estimateTravel(at('江東区', '23'), at('江東区', '23'))).toEqual({ minutes: 15, mode: 'car' })
    expect(estimateTravel(at('江東区', '23'), at('目黒区', '23'))).toEqual({ minutes: 30, mode: 'car' })
    expect(estimateTravel(at('江東区', '23'), at('八千代市', '千葉'))).toEqual({ minutes: 60, mode: 'car' })
  })

  it('場所が分からなければ 30 分', () => {
    expect(estimateTravel(at(null, null), at('江東区', '23'))).toEqual({ minutes: 30, mode: 'car' })
  })

  it('移動手段の文字から徒歩・電車を読む（空なら車）', () => {
    expect(estimateTravel(at('江東区', '23'), at('江東区', '23', '徒歩')).mode).toBe('walk')
    expect(estimateTravel(at('江東区', '23'), at('目黒区', '23', '電車')).mode).toBe('train')
  })
})
