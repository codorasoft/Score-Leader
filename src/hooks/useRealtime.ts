import { useEffect, useEffectEvent } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtime(table: string, filter: { column: string; value: string }, onUpdate: () => void) {
  // A refreshed page may pass a new callback without needing a new subscription.
  const notify = useEffectEvent(onUpdate)
  useEffect(() => {
    if (!filter.value) return
    let active = true
    const refresh = () => { if (active) notify() }
    const wake = () => { if (document.visibilityState === 'visible') refresh() }
    const channel = supabase
      .channel(`${table}:${filter.column}=eq.${filter.value}`, {
        // SUBSCRIBED should mean database changes are streaming, so the catch-up read
        // covers the gap before the initial subscription as well as every reconnect.
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${filter.column}=eq.${filter.value}` },
        refresh,
      )
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })

    // Browsers may suspend a background tab without delivering a disconnect event.
    // The page coalesces these notifications with its ordinary realtime refreshes.
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', wake)

    return () => {
      active = false
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', wake)
      void supabase.removeChannel(channel)
    }
  }, [table, filter.column, filter.value])
}
