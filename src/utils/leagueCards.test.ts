import { cardsForLeague } from './leagueCards'
import type { Match, MatchEvent, Player, Session, TeamPlayer } from '../lib/types'

it('builds each player\'s card from their matches, goals, assists, clean sheets and form', () => {
  const players = [
    { id: 'ali', name: 'Ali', position: 'MID', skill_rating: 3 },
    { id: 'gk', name: 'Keeper', position: 'GK', skill_rating: 3 },
    { id: 'new', name: 'New', position: 'ATT', skill_rating: 4 },
  ] as Player[]
  const league = {
    players,
    sessions: [{ id: 's1', date: '2026-09-01' }] as Session[],
    matches: [
      { id: 'm1', session_id: 's1', match_number: 1, team1_id: 'A', team2_id: 'B', status: 'completed', team1_score: 2, team2_score: 0 },
      { id: 'm2', session_id: 's1', match_number: 2, team1_id: 'A', team2_id: 'B', status: 'completed', team1_score: 0, team2_score: 1 },
    ] as Match[],
    teamPlayers: [{ team_id: 'A', player_id: 'ali' }, { team_id: 'A', player_id: 'gk' }] as TeamPlayer[],
    events: [
      { id: '1', match_id: 'm1', player_id: 'ali', event_type: 'goal' },
      { id: '2', match_id: 'm1', player_id: 'ali', event_type: 'assist' },
    ] as MatchEvent[],
  }
  const cards = cardsForLeague(league)
  expect(cards.get('ali')!.input).toMatchObject({ matches: 2, wins: 1, goals: 1, assists: 1 })
  expect(cards.get('gk')!.input).toMatchObject({ matches: 2, cleanSheets: 1 })
  expect(cards.get('gk')!.card.attributes[0].key).toBe('KEE')
  expect(cards.get('new')!.input.matches).toBe(0)
  expect(cards.get('new')!.card.overall).toBe(45 + 4 * 6)
})
