import { useEffect, useRef } from 'react'
import { playMatchEndAlert } from '../utils/matchAlert'

// Fires only on the false → true transition within one match, so reopening a match that is
// already over (or reloading the page) stays silent.
export function useEndAlert(matchId: string | undefined, shouldEnd: boolean) {
  const prev = useRef<{ matchId: string | undefined; shouldEnd: boolean } | null>(null)

  useEffect(() => {
    const last = prev.current
    if (last && last.matchId === matchId && !last.shouldEnd && shouldEnd) playMatchEndAlert()
    prev.current = { matchId, shouldEnd }
  }, [matchId, shouldEnd])
}
