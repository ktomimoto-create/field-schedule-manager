import { Car, Footprints, TrainFront } from 'lucide-react'
import type { TravelGap } from '../../utils/timeline/layoutDay'

const ICON = { car: Car, walk: Footprints, train: TrainFront } as const

interface Props {
  gap: TravelGap
  left: number
  width: number
}

// 帯と帯の間の移動。線は帯の縦の中央、アイコンと分は線の上に重ね、両脇は背景色で線を割る
export function TravelOverlay({ gap, left, width }: Props) {
  const Icon = ICON[gap.travel.mode]
  const label = `${gap.travel.minutes}分`
  return (
    <div className="dg-travel" style={{ left, width }} title={`移動の目安 ${label}（エリア・県別から見積もり）`}>
      <span className="dg-travel-line" />
      {width >= 20 && (
        <span className="dg-travel-label">
          <Icon size={12} />
          {width >= 44 && <span className="tl-num">{label}</span>}
        </span>
      )}
    </div>
  )
}
