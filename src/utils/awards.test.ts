import { topPlayers, tallyVotes } from './awards'
import type { Match, MatchEvent, Player } from '../lib/types'

const players = ['Ali', 'Omar', 'Sami', 'Hadi', 'Faris'].map((name) => ({ id: name, name }) as Player)
const matches = [
  { id: 'm1', status: 'completed' },
  { id: 'm2', status: 'completed' },
  { id: 'live', status: 'active' },
] as Match[]
let n = 0
const ev = (player_id: string, event_type: MatchEvent['event_type'], match_id = 'm1') =>
  ({ id: `e${++n}`, player_id, event_type, match_id }) as MatchEvent

describe('topPlayers', () => {
  const events = [
    ev('Ali', 'goal'), ev('Ali', 'goal'), ev('Ali', 'penalty_goal', 'm2'),
    ev('Omar', 'goal'), ev('Omar', 'goal', 'm2'),
    ev('Sami', 'goal'), ev('Hadi', 'goal'),
    ev('Faris', 'goal', 'live'), ev('Faris', 'goal', 'live'), ev('Faris', 'goal', 'live'), ev('Faris', 'goal', 'live'),
    ev('Sami', 'assist'), ev('Sami', 'assist'), ev('Hadi', 'assist'),
  ]

  it('ranks the top scorers in finished matches, sharing places on ties', () => {
    const top = topPlayers(players, events, matches, 'goals')
    expect(top.map((r) => [r.player.name, r.count, r.rank])).toEqual([
      ['Ali', 3, 1], ['Omar', 2, 2], ['Sami', 1, 3], ['Hadi', 1, 3],
    ])
  })

  it('ranks assists separately and leaves out players with none', () => {
    const top = topPlayers(players, events, matches, 'assists')
    expect(top.map((r) => [r.player.name, r.count, r.rank])).toEqual([['Sami', 2, 1], ['Hadi', 1, 2]])
  })
})

describe('tallyVotes', () => {
  it('counts votes per nominee, most first, and names the leader', () => {
    const t = tallyVotes(['Ali', 'Omar', 'Sami'], [{ player_id: 'Omar' }, { player_id: 'Omar' }, { player_id: 'Ali' }])
    expect(t.rows).toEqual([{ playerId: 'Omar', votes: 2 }, { playerId: 'Ali', votes: 1 }, { playerId: 'Sami', votes: 0 }])
    expect(t.total).toBe(3)
    expect(t.leaders).toEqual(['Omar'])
  })

  it('reports every tied leader, and no leader before anyone has voted', () => {
    expect(tallyVotes(['Ali', 'Omar'], [{ player_id: 'Ali' }, { player_id: 'Omar' }]).leaders).toEqual(['Ali', 'Omar'])
    expect(tallyVotes(['Ali', 'Omar'], []).leaders).toEqual([])
  })
})
