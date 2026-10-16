import { useSyncExternalStore } from 'react'

// 携帯（767px 以下）かどうか。PC と携帯で画面を分ける（設計書 §3）
export const MOBILE_QUERY = '(max-width: 767px)'

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches

export const useViewport = () => ({
  isMobile: useSyncExternalStore(subscribe, getSnapshot, () => false),
})
