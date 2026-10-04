import type { AwardType, Match, MatchEvent, PlayerPosition, Session, SessionAward, Team, TeamColor } from '../lib/types'

export interface SessionTally {
  played: number
  wins: number
  draws: number
  losses: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  cleanSheets: number
}

export interface SessionHistoryRow extends SessionTally {
  sessionId: string
  date: string
  teamColor: TeamColor | null
  awards: AwardType[]
}

const emptyTally = (): SessionTally => ({
  played: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0,
})

// `teams` are the player's own teams (one per session) and `events` the player's own events.
export function buildPlayerHistory(input: {
  position: PlayerPosition
  sessions: Session[]
  teams: Team[]
  matches: Match[]
  events: MatchEvent[]
  awards: SessionAward[]
}) {
  const { position, sessions, teams, matches, events, awards } = input
  const sessionOfMatch = new Map(matches.map((m) => [m.id, m.session_id]))

  const rows: SessionHistoryRow[] = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const team = teams.find((tm) => tm.session_id === s.id)
      const row: SessionHistoryRow = {
        sessionId: s.id, date: s.date, teamColor: team?.color ?? null, ...emptyTally(),
        awards: awards.filter((a) => a.session_id === s.id).map((a) => a.award_type),
      }

      if (team) {
        for (const m of matches) {
          if (m.session_id !== s.id || m.status !== 'completed') continue
          if (m.team1_id !== team.id && m.team2_id !== team.id) continue
          row.played++
          if (m.is_draw) row.draws++
          else if (m.winner_team_id === team.id) row.wins++
          else row.losses++
          const conceded = m.team1_id === team.id ? m.team2_score : m.team1_score
          if (position === 'GK' && conceded === 0) row.cleanSheets++
        }
      }

      for (const e of events) {
        if (sessionOfMatch.get(e.match_id) !== s.id) continue
        if (e.event_type === 'goal' || e.event_type === 'penalty_goal') row.goals++
        else if (e.event_type === 'assist') row.assists++
        else if (e.event_type === 'yellow_card') row.yellowCards++
        else if (e.event_type === 'red_card') row.redCards++
      }
      return row
    })

  const totals = { sessions: rows.length, ...emptyTally() }
  for (const row of rows) {
    for (const key of Object.keys(emptyTally()) as (keyof SessionTally)[]) totals[key] += row[key]
  }

  const awardCounts: Partial<Record<AwardType, number>> = {}
  for (const a of awards) awardCounts[a.award_type] = (awardCounts[a.award_type] ?? 0) + 1

  return { sessions: rows, totals, awardCounts }
}
