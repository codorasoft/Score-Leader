import { useEffect, useState } from 'react'
import { localToday } from '../utils/trainingDays'

// The device's date, read again each time the app comes back to the front, so an app left open
// past midnight moves on to the new day. `wakes` goes up on every such return, for whoever
// wants to try something again then.
export function useLocalToday(): { today: string; wakes: number } {
  const [state, setState] = useState(() => ({ today: localToday(), wakes: 0 }))

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      setState((s) => ({ today: localToday(), wakes: s.wakes + 1 }))
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return state
}
