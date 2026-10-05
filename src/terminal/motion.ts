import { useEffect, useState } from 'react'

export const DEFAULT_SMOOTH_SCROLL_MS = 120
export const MAX_SMOOTH_SCROLL_MS = 250

export function smoothScrollDuration(duration: number | undefined, enabled: boolean): number {
  if (!enabled) return 0
  if (duration === undefined) return DEFAULT_SMOOTH_SCROLL_MS
  if (!Number.isFinite(duration)) return 0
  return Math.round(Math.max(0, Math.min(MAX_SMOOTH_SCROLL_MS, duration)))
}

/** Event-driven preferences; no animation loop or polling while idle. */
export function useMotionEnabled(animations: boolean, active: boolean): boolean {
  const [allowed, setAllowed] = useState(() =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setAllowed(!preference.matches && document.visibilityState !== 'hidden')
    update()
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      preference.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return animations && active && allowed
}
