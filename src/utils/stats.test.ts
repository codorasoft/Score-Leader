import { computePlayerStats, getAutoAwardWinner, getBestGoalkeepers } from './stats'
import type { Player, MatchEvent, Match } from '../lib/types'
import { matchRosters } from './playerMatches'

// Each player's team per session, with no swaps
const byTeam = (teamMap: Record<string, string[]>, matches: Match[]) => matchRosters({
  matches, events: [],
  teamPlayers: Object.entries(teamMap).flatMap(([player_id, teams]) => teams.map((team_id) => ({ player_id, team_id }))),
})

const mkPlayer = (id: string, position: Player['position'] = 'ATT'): Player => ({
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

  const stats = computePlayerStats(players, events, matches, byTeam(teamMap, matches))
  expect(stats.find((s) => s.player.id === 'p1')?.goals).toBe(2)
  expect(stats.find((s) => s.player.id === 'p2')?.assists).toBe(1)
})

it('counts clean sheets for goalkeepers and defenders only', () => {
  const players = [mkPlayer('gk1', 'GK'), mkPlayer('d1', 'DEF'), mkPlayer('p2')]
  const events: MatchEvent[] = []
  const matches = [mkMatch({ team1_id: 't1', team2_id: 't2', team2_score: 0, winner_team_id: 't1' })]
  const teamMap = { gk1: ['t1'], d1: ['t1'], p2: ['t1'] }

  const stats = computePlayerStats(players, events, matches, byTeam(teamMap, matches))
  expect(stats.find((s) => s.player.id === 'gk1')?.cleanSheets).toBe(1)
  expect(stats.find((s) => s.player.id === 'd1')?.cleanSheets).toBe(1)
  expect(stats.find((s) => s.player.id === 'p2')?.cleanSheets).toBe(0)
})

it('counts draws and interceptions', () => {
  const players = [mkPlayer('d1', 'DEF')]
  const events = [mkEvent({ player_id: 'd1', event_type: 'interception' }), mkEvent({ id: 'e2', player_id: 'd1', event_type: 'interception' })]
  const matches = [mkMatch({ team1_score: 1, team2_score: 1, is_draw: true }), mkMatch({ id: 'm2' })]
  const [d1] = computePlayerStats(players, events, matches, byTeam({ d1: ['t1'] }, matches))
  expect([d1.matchesDrawn, d1.matchesWon, d1.interceptions]).toEqual([1, 1, 2])
})

it('getAutoAwardWinner returns tied=true when multiple players share top', () => {
  const players = [mkPlayer('p1'), mkPlayer('p2'), mkPlayer('p3')]
  const events = [
    mkEvent({ player_id: 'p1', event_type: 'goal' }),
    mkEvent({ id: 'e2', player_id: 'p2', event_type: 'goal' }),
    mkEvent({ id: 'e3', player_id: 'p3', event_type: 'assist' }),
  ]
  const matches = [mkMatch({})]
  const stats = computePlayerStats(players, events, matches, byTeam({ p1: ['t1'], p2: ['t2'], p3: ['t1'] }, matches))
  const result = getAutoAwardWinner(stats, 'best_goalscorer')
  expect(result.tied).toBe(true)
})

it('counts matches and wins from every session the player took part in', () => {
  const players = [mkPlayer('p1')]
  const matches = [
    mkMatch({ id: 'm1', session_id: 's1', team1_id: 't1', team2_id: 't2', winner_team_id: 't1' }),
    mkMatch({ id: 'm2', session_id: 's2', team1_id: 't7', team2_id: 't8', winner_team_id: 't7' }),
  ]
  const [stat] = computePlayerStats(players, [], matches, byTeam({ p1: ['t1', 't7'] }, matches))
  expect(stat.matchesPlayed).toBe(2)
  expect(stat.matchesWon).toBe(2)
})

it('does not count a draw as a win even though the draw keeps a winner_team_id for rotation', () => {
  const players = [mkPlayer('p1')]
  const matches = [mkMatch({ team1_score: 1, team2_score: 1, is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 't1' })]
  const [stat] = computePlayerStats(players, [], matches, byTeam({ p1: ['t1'] }, matches))
  expect(stat.matchesPlayed).toBe(1)
  expect(stat.matchesWon).toBe(0)
})

describe('getBestGoalkeepers', () => {
  // Each keeper's team plays one finished match per number, letting in that many goals
  const keepers = (conceded: Record<string, number[]>, extra: Match[] = []) => {
    const matches = Object.entries(conceded).flatMap(([id, goals]) => goals.map((g, n) =>
      mkMatch({ id: `${id}-${n}`, team1_id: `t-${id}`, team2_id: `opp-${id}-${n}`, team1_score: 0, team2_score: g })))
    const players = Object.keys(conceded).map((id) => mkPlayer(id, id.startsWith('gk') ? 'GK' : 'ATT'))
    const teams = Object.fromEntries(Object.keys(conceded).map((id) => [id, [`t-${id}`]]))
    return getBestGoalkeepers(computePlayerStats(players, [], [...matches, ...extra], byTeam(teams, [...matches, ...extra]))).map((s) => s.player.id)
  }

  it('picks the keeper who let in the fewest goals per match, not in total', () => {
    // gk1: 3 in 6 (0.5 a match), gk2: 2 in 3 (0.67)
    expect(keepers({ gk1: [1, 0, 1, 0, 1, 0], gk2: [1, 0, 1] })).toEqual(['gk1'])
  })

  it('leaves out keepers who played under half as many matches as the busiest keeper', () => {
    // gk2 kept a clean sheet in his only match, but gk1 played six
    expect(keepers({ gk1: [1, 0, 1, 0, 1, 0], gk2: [0] })).toEqual(['gk1'])
    // At exactly half, gk2 counts and wins on goals per match
    expect(keepers({ gk1: [1, 0, 1, 0, 1, 0], gk2: [0, 0, 1] })).toEqual(['gk2'])
  })

  it('breaks a tie on goals per match by more clean sheets, then more matches', () => {
    // Both let in 1 a match; gk1 kept a clean sheet
    expect(keepers({ gk1: [0, 2], gk2: [1, 1] })).toEqual(['gk1'])
    // Both let in 1 a match with no clean sheets; gk2 played more
    expect(keepers({ gk1: [1], gk2: [1, 1] })).toEqual(['gk2'])
  })

  it('lets keepers still level share the award', () => {
    expect(keepers({ gk1: [0, 1], gk2: [1, 0] })).toEqual(['gk1', 'gk2'])
  })

  it('ignores players who are not goalkeepers and matches not finished', () => {
    const pending = mkMatch({ id: 'p', team1_id: 't-gk2', team2_id: 'x', status: 'pending', team1_score: 0, team2_score: 0 })
    expect(keepers({ p1: [0, 0], gk1: [2, 2], gk2: [] }, [pending])).toEqual(['gk1'])
  })

  it('has no winner when no keeper played', () => {
    expect(keepers({ p1: [0] })).toEqual([])
  })
})
