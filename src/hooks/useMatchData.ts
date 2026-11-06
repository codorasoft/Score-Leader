import { useState, useEffect, useRef, useCallback, type SetStateAction } from 'react'
import { supabase } from '../lib/supabase'
import { outbox } from '../lib/pitchOutbox'
import { overlayPending } from '../lib/outboxOverlay'
import { fetchSession, type SessionData } from '../lib/sessionData'
import type { OutboxOp } from '../lib/outbox'
import { scoreFromGoals } from '../utils/matchEdit'
import type { Match, Session, Team, Player, MatchEvent, TeamPlayer } from '../lib/types'

// The match screen's data: the match and its session from the server, with the changes still
// waiting on this phone shown on top
export function useMatchData(sessionId: string | undefined, matchId: string | undefined, leagueId: string) {
  const key = `${leagueId}:${sessionId}:${matchId}`
  const [stateKey, setStateKey] = useState(key)
  const activeKeyRef = useRef<string | null>(null)
  const requestRef = useRef(0)
  const confirmedMatch = useRef<Match | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [sessionMatches, setSessionMatches] = useState<Match[]>([])
  const [sessionEvents, setSessionEvents] = useState<MatchEvent[]>([])
  const [endBlocked, setEndBlocked] = useState(false)
  // No such match in this league's session (an old or mistyped link)
  const [missing, setMissing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  // A change saved on this phone was refused by the server, and the screen has not reloaded since:
  // the score shown may be wrong, so the match must not be ended from it
  const staleRef = useRef(false)
  const seenRejectedRef = useRef(outbox.rejected())

  // One request for the whole session; runs on open and after every goal, card or swap
  const load = useCallback(async () => {
    if (activeKeyRef.current !== key) return
    const request = ++requestRef.current
    const current = () => activeKeyRef.current === key && requestRef.current === request
    setLoadFailed(false)
    const refusedBefore = seenRejectedRef.current
    let data: SessionData | null
    try {
      data = await fetchSession('id', sessionId ?? '', leagueId)
    } catch {
      // Offline: keep what is on screen rather than wiping it
      if (current()) setLoadFailed(true)
      return
    }
    if (!current()) return
    const m = data?.matches.find((x) => x.id === matchId)
    if (!data || !m) { setMissing(true); return }

    // A goal and its score are saved by separate requests, so the server can accept one and refuse
    // the other. The timeline decides: with nothing waiting on this phone, a score that disagrees
    // with it is put right. Only if the score is still the one just read, so a goal being saved
    // from another phone is never overwritten.
    const settled = outbox.pending().length === 0 && !outbox.isFlushing()
    let scoreConfirmed = settled
    if (m.status !== 'completed' && settled) {
      const real = scoreFromGoals(m, data.events.filter((e) => e.match_id === m.id))
      if (real.team1_score !== m.team1_score || real.team2_score !== m.team2_score) {
        staleRef.current = true
        scoreConfirmed = false
        try {
          const { data: repaired, error } = await supabase.from('matches').update(real)
            .eq('id', m.id).eq('team1_score', m.team1_score).eq('team2_score', m.team2_score)
            .neq('status', 'completed').select('id').maybeSingle()
          if (repaired && !error) { Object.assign(m, real); scoreConfirmed = true }
        } catch { /* finish must wait for a confirmed score */ }
      }
    }
    if (!current()) return
    setMissing(false)
    if (scoreConfirmed && seenRejectedRef.current === refusedBefore) staleRef.current = false
    const finished = new Set(data.matches.filter((x) => x.status === 'completed').map((x) => x.id))
    setSession(data.session)
    setSessionMatches(data.matches)
    setSessionEvents(data.events.filter((e) => finished.has(e.match_id)))
    setTeams(data.teams)
    setPlayers(data.players)

    // Changes still waiting on this phone are shown on top of what the server has
    confirmedMatch.current = m
    const shown = overlayPending(outbox.pending(), {
      match: m,
      events: data.events.filter((e) => e.match_id === m.id),
      teamPlayers: data.teamPlayers,
    })
    setMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)
  }, [sessionId, matchId, leagueId, key])

  useEffect(() => {
    activeKeyRef.current = key
    confirmedMatch.current = null
    setStateKey(key)
    setMatch(null)
    setSession(null)
    setTeams([])
    setTeamPlayers([])
    setPlayers([])
    setEvents([])
    setSessionMatches([])
    setSessionEvents([])
    setMissing(false)
    setEndBlocked(false)
    staleRef.current = false
    seenRejectedRef.current = outbox.rejected()
    load()
    return () => {
      activeKeyRef.current = null
    }
  }, [load, key])

  // A response requested before a local edit must not replace that optimistic change.
  const updateMatch = useCallback((next: SetStateAction<Match | null>) => {
    if (activeKeyRef.current !== key) return
    requestRef.current++
    setMatch(next)
  }, [key])

  // Once every waiting change has been sent, reload so the screen shows the server's copy
  useEffect(() => outbox.subscribe((delivery) => {
    const saved = confirmedMatch.current
    const { op, accepted } = delivery ?? {}
    if (saved && op?.kind === 'update' && op.table === 'matches' && op.match.id === saved.id) {
      if (accepted) {
        confirmedMatch.current = { ...saved, ...op.values }
      } else if ('timer_status' in op.values) {
        // A refused clock edit can also arrive after an offline replay. Restore the last
        // confirmed match plus remaining edits even when the following reload cannot run.
        const shown = overlayPending(outbox.pending(), { match: saved, events: [], teamPlayers: [] })
        updateMatch(shown.match)
      }
    }
    const refused = outbox.rejected()
    if (refused > seenRejectedRef.current) staleRef.current = true
    seenRejectedRef.current = refused
    if (outbox.pending().length === 0 && !outbox.isFlushing()) {
      setEndBlocked(false)
      load()
    }
  }), [load, updateMatch])

  // Show the change immediately, then send it (or keep it on the phone until there is signal)
  const apply = async (ops: OutboxOp[]) => {
    if (!match || activeKeyRef.current !== key) return
    const shown = overlayPending(ops, { match, events, teamPlayers })
    updateMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)
    // Register the goal, assist and score together. The drain subscription above
    // refreshes once the whole action finishes, including after a server refusal.
    await outbox.runBatchOrQueue(ops)
  }

  const current = stateKey === key
  return {
    match: current ? match : null, setMatch: updateMatch, session: current ? session : null,
    teams: current ? teams : [], teamPlayers: current ? teamPlayers : [], players: current ? players : [],
    events: current ? events : [], sessionMatches: current ? sessionMatches : [], sessionEvents: current ? sessionEvents : [],
    load, apply, endBlocked: current && endBlocked, setEndBlocked, staleRef,
    missing: current && missing, loadFailed: current && loadFailed,
  }
}
