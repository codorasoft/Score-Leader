import { computePlayerStats, getAutoAwardWinner } from './stats'
import type { Player, MatchEvent, Match } from '../lib/types'

const mkPlayer = (id: string, position: 'GK' | 'ATT' = 'ATT'): Player => ({
  id, name: `P${id}`, position, skill_rating: 3, photo_url: null, is_active: true, created_at: '',
})

const mkEvent = (o: Partial<MatchEvent>): MatchEvent => ({
  id: 'e1', match_id: 'm1', player_id: 'p1', team_id: 't1',
  event_type: 'goal', related_event_id: null, minute: 1,
  suspension_minutes: null, suspension_started_at: null, suspension_ended_at: null, created_at: '',
  ...o,
})

const mkMatch = (o: Partial<Match>): Match => ({
  id: 'm1', session_id: 's1', match_number: 1,
  team1_id: 't1', team2_id: 't2', waiting_team_id: 't3',
  status: 'completed', team1_score: 2, team2_score: 0,
  winner_team_id: 't1', is_draw: false, draw_resolved_by: null,
  timer_started_at: null, timer_elapsed_seconds: 0, timer_status: 'stopped',
  created_at: '',
  ...o,
})

it('counts goals and assists correctly', () => {
  const players = [mkPlayer('p1'), mkPlayer('p2')]
  const events = [
    mkEvent({ player_id: 'p1', event_type: 'goal' }),
    mkEvent({ id: 'e2', player_id: 'p1', event_type: 'goal' }),
    mkEvent({ id: 'e3', player_id: 'p2', event_type: 'assist' }),
  ]
  const matches = [mkMatch({})]
  const teamMap = { p1: ['t1'], p2: ['t1'] }

  const stats = computePlayerStats(players, events, matches, teamMap)
  expect(stats.find((s) => s.player.id === 'p1')?.goals).toBe(2)
  expect(stats.find((s) => s.player.id === 'p2')?.assists).toBe(1)
})

it('counts clean sheets for GK only', () => {
  const players = [mkPlayer('gk1', 'GK'), mkPlayer('p2')]
  const events: MatchEvent[] = []
  const matches = [mkMatch({ team1_id: 't1', team2_id: 't2', team2_score: 0, winner_team_id: 't1' })]
  const teamMap = { gk1: ['t1'], p2: ['t1'] }

  const stats = computePlayerStats(players, events, matches, teamMap)
  expect(stats.find((s) => s.player.id === 'gk1')?.cleanSheets).toBe(1)
  expect(stats.find((s) => s.player.id === 'p2')?.cleanSheets).toBe(0)
})

it('getAutoAwardWinner returns tied=true when multiple players share top', () => {
  const players = [mkPlayer('p1'), mkPlayer('p2'), mkPlayer('p3')]
  const events = [
    mkEvent({ player_id: 'p1', event_type: 'goal' }),
    mkEvent({ id: 'e2', player_id: 'p2', event_type: 'goal' }),
    mkEvent({ id: 'e3', player_id: 'p3', event_type: 'assist' }),
  ]
  const matches = [mkMatch({})]
  const stats = computePlayerStats(players, events, matches, { p1: ['t1'], p2: ['t2'], p3: ['t1'] })
  const result = getAutoAwardWinner(stats, 'best_goalscorer')
  expect(result.tied).toBe(true)
})

it('counts matches and wins from every session the player took part in', () => {
  const players = [mkPlayer('p1')]
  const matches = [
    mkMatch({ id: 'm1', session_id: 's1', team1_id: 't1', team2_id: 't2', winner_team_id: 't1' }),
    mkMatch({ id: 'm2', session_id: 's2', team1_id: 't7', team2_id: 't8', winner_team_id: 't7' }),
  ]
  const [stat] = computePlayerStats(players, [], matches, { p1: ['t1', 't7'] })
  expect(stat.matchesPlayed).toBe(2)
  expect(stat.matchesWon).toBe(2)
})

it('does not count a draw as a win even though the draw keeps a winner_team_id for rotation', () => {
  const players = [mkPlayer('p1')]
  const matches = [mkMatch({ team1_score: 1, team2_score: 1, is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 't1' })]
  const [stat] = computePlayerStats(players, [], matches, { p1: ['t1'] })
  expect(stat.matchesPlayed).toBe(1)
  expect(stat.matchesWon).toBe(0)
})
