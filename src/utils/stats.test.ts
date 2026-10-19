import { computePlayerStats, getAutoAwardWinner, getBestGoalkeepers } from './stats'
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

describe('getBestGoalkeepers', () => {
  // t1 v t2 2-0, t1 v t3 1-1, t2 v t3 0-3: t1 let in 1 (2 matches), t2 5, t3 1 (2 matches)
  const matches = [
    mkMatch({ id: 'm1', team1_id: 't1', team2_id: 't2', team1_score: 2, team2_score: 0 }),
    mkMatch({ id: 'm2', team1_id: 't1', team2_id: 't3', team1_score: 1, team2_score: 1, is_draw: true }),
    mkMatch({ id: 'm3', team1_id: 't2', team2_id: 't3', team1_score: 0, team2_score: 3 }),
  ]
  const keepers = (teams: Record<string, string[]>, ms = matches) =>
    getBestGoalkeepers(computePlayerStats(Object.keys(teams).map((id) => mkPlayer(id, id.startsWith('gk') ? 'GK' : 'ATT')), [], ms, teams))
      .map((s) => s.player.id)

  it('picks the keeper who let in the fewest goals', () => {
    expect(keepers({ gk1: ['t1'], gk2: ['t2'] })).toEqual(['gk1'])
  })

  it('counts goals let in, not clean sheets', () => {
    // gk2 kept a clean sheet in m1 but let in 3 in m3; gk3 had no clean sheet and let in 1
    expect(keepers({ gk2: ['t2'], gk3: ['t3'] })).toEqual(['gk3'])
  })

  it('ignores players who are not goalkeepers and keepers who played no finished match', () => {
    const pending = [...matches, mkMatch({ id: 'm4', team1_id: 't4', team2_id: 't2', status: 'pending', team1_score: 0, team2_score: 0 })]
    expect(keepers({ p1: ['t1'], gk2: ['t2'], gk4: ['t4'] }, pending)).toEqual(['gk2'])
  })

  it('breaks a tie on goals per match', () => {
    // gk1 and gk5 both let in 1, but gk5 over three matches
    const more = [...matches,
      mkMatch({ id: 'm5', team1_id: 't5', team2_id: 't6', team1_score: 1, team2_score: 1 }),
      mkMatch({ id: 'm6', team1_id: 't5', team2_id: 't6', team1_score: 1, team2_score: 0 }),
      mkMatch({ id: 'm7', team1_id: 't5', team2_id: 't6', team1_score: 2, team2_score: 0 }),
    ]
    expect(keepers({ gk1: ['t1'], gk5: ['t5'] }, more)).toEqual(['gk5'])
  })

  it('lets keepers still level share the award', () => {
    expect(keepers({ gk1: ['t1'], gk3: ['t3'] })).toEqual(['gk1', 'gk3'])
  })

  it('has no winner when no keeper played', () => {
    expect(keepers({ p1: ['t1'] })).toEqual([])
  })
})
