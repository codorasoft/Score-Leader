import type { TFunction } from 'i18next'
import type { Match } from '../lib/types'

// One line for a finished match's result: "X wins", "X wins aet", "X wins on penalties · pens 4–3",
// "Draw · X wins" (stay rule) or "Draw" (a draw that stands)
export function resultLabel(
  m: Pick<Match, 'is_draw' | 'draw_resolved_by' | 'winner_team_id' | 'penalties_team1' | 'penalties_team2'>,
  teamName: (id: string | null) => string,
  t: TFunction,
): string {
  if (!m.is_draw) {
    return t(m.draw_resolved_by === 'extra_time' ? 'timeline.winsAet' : 'timeline.wins', { team: teamName(m.winner_team_id) })
  }
  if (m.draw_resolved_by === 'penalties') {
    const wins = t('timeline.winsPens', { team: teamName(m.winner_team_id) })
    return m.penalties_team1 != null && m.penalties_team2 != null
      ? `${wins} · ${t('timeline.pens', { a: m.penalties_team1, b: m.penalties_team2 })}`
      : wins
  }
  if (m.winner_team_id) return t('timeline.drawWinner', { team: teamName(m.winner_team_id) })
  return t('timeline.draw')
}
