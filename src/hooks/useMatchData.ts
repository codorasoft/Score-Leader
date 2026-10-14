import { useState, useEffect, useRef, useCallback } from 'react'
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

  // A change saved on this phone was refused by the server, and the screen has not reloaded since:
  // the score shown may be wrong, so the match must not be ended from it
  const staleRef = useRef(false)
  const seenRejectedRef = useRef(outbox.rejected())

  // One request for the whole session; runs on open and after every goal, card or swap
  const load = useCallback(async () => {
    const refusedBefore = seenRejectedRef.current
    let data: SessionData | null
    try {
      data = await fetchSession('id', sessionId ?? '', leagueId)
    } catch {
      // Offline: keep what is on screen rather than wiping it
      return
    }
    const m = data?.matches.find((x) => x.id === matchId)
    if (!data || !m) { setMissing(true); return }
    setMissing(false)
    if (seenRejectedRef.current === refusedBefore) staleRef.current = false

    // A goal and its score are saved by separate requests, so the server can accept one and refuse
    // the other. The timeline decides: with nothing waiting on this phone, a score that disagrees
    // with it is put right. Only if the score is still the one just read, so a goal being saved
    // from another phone is never overwritten.
    if (m.status !== 'completed' && outbox.pending().length === 0 && !outbox.isFlushing()) {
      const real = scoreFromGoals(m, data.events.filter((e) => e.match_id === m.id))
      if (real.team1_score !== m.team1_score || real.team2_score !== m.team2_score) {
        const { error } = await supabase.from('matches').update(real)
          .eq('id', m.id).eq('team1_score', m.team1_score).eq('team2_score', m.team2_score)
        if (!error) Object.assign(m, real)
      }
    }
    const finished = new Set(data.matches.filter((x) => x.status === 'completed').map((x) => x.id))
    setSession(data.session)
    setSessionMatches(data.matches)
    setSessionEvents(data.events.filter((e) => finished.has(e.match_id)))
    setTeams(data.teams)
    setPlayers(data.players)

    // Changes still waiting on this phone are shown on top of what the server has
    const shown = overlayPending(outbox.pending(), {
      match: m,
      events: data.events.filter((e) => e.match_id === m.id),
      teamPlayers: data.teamPlayers,
    })
    setMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)
  }, [sessionId, matchId, leagueId])

  useEffect(() => { load() }, [load])

  // Once every waiting change has been sent, reload so the screen shows the server's copy
  useEffect(() => outbox.subscribe(() => {
    const refused = outbox.rejected()
    if (refused > seenRejectedRef.current) staleRef.current = true
    seenRejectedRef.current = refused
    if (outbox.pending().length === 0 && !outbox.isFlushing()) {
      setEndBlocked(false)
      load()
    }
  }), [load])

  // Show the change immediately, then send it (or keep it on the phone until there is signal)
  const apply = async (ops: OutboxOp[]) => {
    if (!match) return
    const shown = overlayPending(ops, { match, events, teamPlayers })
    setMatch(shown.match)
    setEvents(shown.events)
    setTeamPlayers(shown.teamPlayers)
    let allSent = true
    for (const op of ops) {
      const outcome = await outbox.runOrQueue(op)
      if (outcome === 'failed') { load(); return }
      if (outcome === 'queued') allSent = false
    }
    if (allSent) load()
  }

  // Show the clock change at once (also when it waits offline in the outbox), then reload
  const refreshMatch = () => {
    setMatch((m) => (m ? overlayPending(outbox.pending(), { match: m, events: [], teamPlayers: [] }).match : m))
    return load()
  }

  return {
    match, setMatch, session, teams, teamPlayers, players, events, sessionMatches, sessionEvents,
    load, apply, refreshMatch, endBlocked, setEndBlocked, staleRef, missing,
  }
}
