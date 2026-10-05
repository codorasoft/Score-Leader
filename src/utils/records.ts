import type { FullLeague } from '../lib/league'
import type { Match, TeamColor } from '../lib/types'
import { matchesByPlayer, partnerships } from './playerMatches'

export type RecordHolder =
  | { kind: 'player'; playerId: string; name: string; date?: string }
  | { kind: 'match'; winnerColor: TeamColor; loserColor: TeamColor; winnerScore: number; loserScore: number; date: string }
  | { kind: 'duo'; names: [string, string]; matches: number; wins: number }

export interface LeagueRecord {
  id: string
  icon: string
  value: number
  holders: RecordHolder[]
}

const DUO_MIN_MATCHES = 5
const UNBEATEN_RESULTS = new Set(['W', 'D'])

// Keeps every candidate tied at the best value
const best = <T,>(items: { value: number; item: T }[]) => {
  const top = Math.max(0, ...items.map((i) => i.value))
  return { value: top, items: top > 0 ? items.filter((i) => i.value === top).map((i) => i.item) : [] }
}

const longestRun = (results: string[], counts: (r: string) => boolean) => {
  let longest = 0
  let run = 0
  for (const r of results) {
    run = counts(r) ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

export function computeRecords(league: Pick<FullLeague, 'players' | 'sessions' | 'teams' | 'teamPlayers' | 'matches' | 'events'>): LeagueRecord[] {
  const completed = league.matches.filter((m) => m.status === 'completed')
  const matchById = new Map(completed.map((m) => [m.id, m]))
  const sessionDate = new Map(league.sessions.map((s) => [s.id, s.date]))
  const colorOf = new Map(league.teams.map((t) => [t.id, t.color]))
  const name = (id: string) => league.players.find((p) => p.id === id)?.name ?? '?'
  const player = (playerId: string, date?: string): RecordHolder => ({ kind: 'player', playerId, name: name(playerId), ...(date ? { date } : {}) })
  const matchHolder = (m: Match): RecordHolder => {
    const team1Won = m.team1_score >= m.team2_score
    return {
      kind: 'match',
      winnerColor: colorOf.get(team1Won ? m.team1_id : m.team2_id)!,
      loserColor: colorOf.get(team1Won ? m.team2_id : m.team1_id)!,
      winnerScore: Math.max(m.team1_score, m.team2_score),
      loserScore: Math.min(m.team1_score, m.team2_score),
      date: sessionDate.get(m.session_id) ?? '',
    }
  }
  const records: LeagueRecord[] = []
  const push = (id: string, icon: string, r: { value: number; items: RecordHolder[] }) => {
    if (r.items.length > 0) records.push({ id, icon, value: r.value, holders: r.items })
  }

  // Biggest win: widest margin, then more goals
  const decisive = completed.filter((m) => m.team1_score !== m.team2_score)
  const margin = best(decisive.map((m) => ({ value: Math.abs(m.team1_score - m.team2_score), item: m })))
  const widest = best(margin.items.map((m) => ({ value: m.team1_score + m.team2_score, item: m })))
  push('biggest_win', '💥', { value: margin.value, items: widest.items.map(matchHolder) })

  const totals = best(completed.map((m) => ({ value: m.team1_score + m.team2_score, item: m })))
  push('most_goals_match', '🎆', { value: totals.value, items: totals.items.map(matchHolder) })

  // Fastest goal: only goals logged with an exact clock time
  const timedGoals = league.events.filter((e) =>
    matchById.has(e.match_id) && (e.event_type === 'goal' || e.event_type === 'penalty_goal') && e.elapsed_seconds != null)
  if (timedGoals.length > 0) {
    const fastest = Math.min(...timedGoals.map((e) => e.elapsed_seconds!))
    push('fastest_goal', '⚡', {
      value: fastest,
      items: timedGoals.filter((e) => e.elapsed_seconds === fastest)
        .map((e) => player(e.player_id, sessionDate.get(matchById.get(e.match_id)!.session_id))),
    })
  }

  // Per player per session tallies
  const tally = new Map<string, { playerId: string; date: string; goals: number; assists: number }>()
  for (const e of league.events) {
    const m = matchById.get(e.match_id)
    if (!m) continue
    const isGoal = e.event_type === 'goal' || e.event_type === 'penalty_goal'
    if (!isGoal && e.event_type !== 'assist') continue
    const key = `${e.player_id}|${m.session_id}`
    const t = tally.get(key) ?? { playerId: e.player_id, date: sessionDate.get(m.session_id) ?? '', goals: 0, assists: 0 }
    if (isGoal) t.goals++
    else t.assists++
    tally.set(key, t)
  }
  const sessionRows = [...tally.values()].sort((a, b) => a.date.localeCompare(b.date))
  const sessionBest = (pick: (t: (typeof sessionRows)[number]) => number) =>
    best(sessionRows.map((t) => ({ value: pick(t), item: player(t.playerId, t.date) })))
  push('session_goals', '🎩', sessionBest((t) => t.goals))
  push('session_assists', '🎯', sessionBest((t) => t.assists))
  push('session_contributions', '🔥', sessionBest((t) => t.goals + t.assists))

  // Streaks and attendance, players in roster order
  const played = matchesByPlayer(league)
  const perPlayer = league.players.filter((p) => played.has(p.id)).map((p) => ({ p, list: played.get(p.id)! }))
  push('win_streak', '📈', best(perPlayer.map(({ p, list }) => ({ value: longestRun(list.map((x) => x.result), (r) => r === 'W'), item: player(p.id) }))))
  push('unbeaten_streak', '🛡️', best(perPlayer.map(({ p, list }) => ({ value: longestRun(list.map((x) => x.result), (r) => UNBEATEN_RESULTS.has(r)), item: player(p.id) }))))
  push('most_sessions', '📅', best(perPlayer.map(({ p, list }) => ({ value: new Set(list.map((x) => x.match.session_id)).size, item: player(p.id) }))))

  // Goalkeeper clean sheets in one session
  const gkSessions = perPlayer
    .filter(({ p }) => p.position === 'GK')
    .flatMap(({ p, list }) => {
      const bySession = new Map<string, number>()
      for (const x of list) if (x.goalsAgainst === 0) bySession.set(x.sessionDate, (bySession.get(x.sessionDate) ?? 0) + 1)
      return [...bySession].map(([date, value]) => ({ value, item: player(p.id, date) }))
    })
  push('session_clean_sheets', '🧱', best(gkSessions))

  // Best duo: highest win rate together, then more matches
  const duos = partnerships(league).filter((d) => d.matches >= DUO_MIN_MATCHES)
  if (duos.length > 0) {
    const top = [...duos].sort((x, y) => y.wins / y.matches - x.wins / x.matches || y.matches - x.matches)[0]
    const rate = top.wins / top.matches
    const tied = duos.filter((d) => d.wins / d.matches === rate && d.matches === top.matches)
    push('best_duo', '🤝', {
      value: Math.round(rate * 100),
      items: tied.map((d) => ({ kind: 'duo', names: [name(d.a), name(d.b)], matches: d.matches, wins: d.wins })),
    })
  }

  return records
}
