import { formRatings, blendStrength } from './playerForm'
import type { Match, MatchEvent, Player, Session, TeamPlayer } from '../lib/types'

describe('blendStrength', () => {
  it('uses stars at weight 0, form at weight 1, and a mix in between', () => {
    expect(blendStrength(4, 2, 0)).toBe(4)
    expect(blendStrength(4, 2, 1)).toBe(2)
    expect(blendStrength(4, 2, 0.5)).toBe(3)
  })
  it('falls back to stars when a player has no history', () => {
    expect(blendStrength(4, undefined, 1)).toBe(4)
  })
})

describe('formRatings', () => {
  const players = ['Ali', 'Omar', 'New'].map((name) => ({ id: name, name }) as Player)
  const session = (id: string, date: string) => ({ id, date }) as Session
  const match = (id: string, session_id: string, team1_id: string, team2_id: string, a: number, b: number) =>
    ({ id, session_id, status: 'completed', team1_id, team2_id, waiting_team_id: 'x', team1_score: a, team2_score: b }) as Match
  const ev = (id: string, match_id: string, player_id: string, event_type: MatchEvent['event_type']) =>
    ({ id, match_id, player_id, event_type }) as MatchEvent

  it('rates win rate and goal involvement per match over recent sessions on a 0–5 scale', () => {
    const data = {
      players,
      sessions: [session('s1', '2026-09-01'), session('s2', '2026-09-08')],
      matches: [match('m1', 's1', 'A1', 'B1', 2, 0), match('m2', 's2', 'A2', 'B2', 0, 1)],
      teamPlayers: [
        { team_id: 'A1', player_id: 'Ali' }, { team_id: 'A2', player_id: 'Ali' },
        { team_id: 'B1', player_id: 'Omar' }, { team_id: 'B2', player_id: 'Omar' },
      ] as TeamPlayer[],
      events: [ev('1', 'm1', 'Ali', 'goal'), ev('2', 'm1', 'Ali', 'goal'), ev('3', 'm2', 'Omar', 'goal')],
    }
    const form = formRatings(data, 5)
    // Ali: 2 matches, 1 win (0.5), involvement 2 goals / 2 matches = 1 (capped) → 5 * (0.25 + 0.5) = 3.75
    expect(form.get('Ali')).toBeCloseTo(3.75)
    // Omar: 2 matches, 1 win (0.5), involvement 1 / 2 = 0.5 → 5 * (0.25 + 0.25) = 2.5
    expect(form.get('Omar')).toBeCloseTo(2.5)
    expect(form.has('New')).toBe(false)
  })

  it('only looks at the most recent sessions the player took part in', () => {
    const data = {
      players,
      sessions: [session('old', '2026-01-01'), session('new', '2026-09-01')],
      matches: [match('m-old', 'old', 'A1', 'B1', 5, 0), match('m-new', 'new', 'A2', 'B2', 0, 1)],
      teamPlayers: [{ team_id: 'A1', player_id: 'Ali' }, { team_id: 'A2', player_id: 'Ali' }] as TeamPlayer[],
      events: [ev('1', 'm-old', 'Ali', 'goal')],
    }
    // Last 1 session only: the loss with no goals → 0
    expect(formRatings(data, 1).get('Ali')).toBe(0)
  })
})
