import type { TFunction } from 'i18next'
import type { AwardType, Match, MatchEvent, Player, SessionAward, Team } from '../lib/types'
import { computeStandings } from './standings'
import { topPlayers, type TopPlayer } from './awards'

const MEDALS = ['🥇', '🥈', '🥉']

const AWARD_ORDER: { type: AwardType; icon: string; key: string }[] = [
  { type: 'mvp', icon: '⭐', key: 'awards.mvp' },
  { type: 'best_goalkeeper', icon: '🧤', key: 'awards.bestGk' },
  { type: 'best_goalscorer', icon: '⚽', key: 'awards.bestScorer' },
  { type: 'best_assister', icon: '🎯', key: 'awards.bestAssister' },
  { type: 'fair_play', icon: '🤝', key: 'awards.fairPlay' },
]

interface SummaryInput {
  t: TFunction
  date: string
  teams: Team[]
  players: Player[]
  matches: Match[]
  events: MatchEvent[]
  awards: SessionAward[]
  url: string
}

// Plain text (emoji, no markdown) so it pastes cleanly into Messenger.
export function buildSessionSummary({ t, date, teams, players, matches, events, awards, url }: SummaryInput): string {
  const finished = matches.filter((m) => m.status === 'completed')
  const finishedIds = new Set(finished.map((m) => m.id))
  const goals = events.filter((e) => finishedIds.has(e.match_id) && (e.event_type === 'goal' || e.event_type === 'penalty_goal')).length
  const teamName = (team: Team) => t('common.teamName', { color: t(`common.teamColor.${team.color}`) })
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'

  const sections: string[][] = [[
    t('summary.heading', { date }),
    `${t('summary.matches', { count: finished.length })} · ${goals} ${t('awards.goalsUnit', { count: goals })}`,
  ]]

  const standings = computeStandings(teams, matches)
  if (standings.some((r) => r.played > 0)) {
    sections.push([
      `🏆 ${t('standings.title')}`,
      ...standings.map((r) =>
        `${MEDALS[r.rank - 1] ?? r.rank} ${teamName(r.team)} — ${t('standings.record', { w: r.wins, d: r.draws, l: r.losses })} ${t('summary.score', { for: r.goalsFor, against: r.goalsAgainst })}`),
    ])
  }

  // One line per place, listing everyone who shares it
  const topLines = (rows: TopPlayer[]) => [...new Set(rows.map((r) => r.rank))].map((rank) => {
    const atRank = rows.filter((r) => r.rank === rank)
    return `${MEDALS[rank - 1]} ${atRank.map((r) => r.player.name).join(', ')} — ${atRank[0].count}`
  })
  const scorers = topPlayers(players, events, matches, 'goals')
  if (scorers.length > 0) sections.push([`⚽ ${t('awards.topScorers')}`, ...topLines(scorers)])
  const assisters = topPlayers(players, events, matches, 'assists')
  if (assisters.length > 0) sections.push([`🎯 ${t('awards.topAssists')}`, ...topLines(assisters)])

  const awardLines = AWARD_ORDER.flatMap(({ type, icon, key }) => {
    const a = awards.find((x) => x.award_type === type)
    return a ? [`${icon} ${t(key)}: ${playerName(a.winner_player_id)}${a.is_tied ? ` ${t('awards.tied')}` : ''}`] : []
  })
  if (awardLines.length > 0) sections.push([`🏅 ${t('awards.title')}`, ...awardLines])

  sections.push([t('summary.link', { url })])
  return sections.map((s) => s.join('\n')).join('\n\n')
}
