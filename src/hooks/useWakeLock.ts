import { useEffect } from 'react'

// Keeps the phone screen on while enabled; the browser drops the lock when the tab is hidden,
// so it is re-acquired whenever the page becomes visible again.
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !navigator.wakeLock) return
    let lock: WakeLockSentinel | null = null
    let active = true

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (active) lock = sentinel
        else sentinel.release()
      } catch { /* denied, e.g. low battery mode */ }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      lock?.release()
    }
  }, [enabled])
}
