import type { Schedule } from '../../types'

// 移動の目安。住所の座標は持っていないので、エリア（区市）と県別だけで粗く見積もる。
// 要望が強ければ Phase 2 で地図 API を検討する（設計書 §11）。
export type TravelMode = 'car' | 'walk' | 'train'

export interface Travel {
  minutes: number
  mode: TravelMode
}

type Place = Pick<Schedule, 'area' | 'prefecture'>

const modeOf = (transport: string | null | undefined): TravelMode => {
  const t = (transport || '').trim()
  if (/徒歩|歩き/.test(t)) return 'walk'
  if (/電車|鉄道|地下鉄|JR|公共/.test(t)) return 'train'
  return 'car'
}

export const estimateTravel = (from: Place, to: Place & Pick<Schedule, 'transport'>): Travel => {
  const fromArea = (from.area || '').trim()
  const toArea = (to.area || '').trim()
  const fromPref = (from.prefecture || '').trim()
  const toPref = (to.prefecture || '').trim()

  let minutes: number
  if (fromArea && fromArea === toArea) minutes = 15
  else if (!fromPref || !toPref || fromPref === toPref) minutes = 30
  else minutes = 60

  return { minutes, mode: modeOf(to.transport) }
}
