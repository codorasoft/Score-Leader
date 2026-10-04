import { computeBadges, careerFromHistory, type Career } from './badges'
import type { SessionHistoryRow } from './playerHistory'

const career = (o: Partial<Career> = {}): Career => ({
  goals: 0, assists: 0, wins: 0, sessions: 0, cleanSheets: 0,
  hatTricks: 0, playmakerSessions: 0, unbeatenSessions: 0,
  potmMonths: 0, mvpAwards: 0, gkAwards: 0, ...o,
})

it('earns every milestone reached and counts repeatable badges', () => {
  const { earned } = computeBadges(career({ goals: 27, hatTricks: 2, assists: 1, wins: 12, sessions: 6, potmMonths: 1, mvpAwards: 3 }))
  const ids = earned.map((b) => b.id)
  expect(ids).toEqual(expect.arrayContaining(['first_goal', 'goals_10', 'goals_25', 'hat_trick', 'first_assist', 'wins_10', 'sessions_5', 'potm', 'mvp']))
  expect(ids).not.toContain('goals_50')
  expect(earned.find((b) => b.id === 'hat_trick')!.count).toBe(2)
  expect(earned.find((b) => b.id === 'mvp')!.count).toBe(3)
  expect(earned.find((b) => b.id === 'goals_25')!.count).toBeUndefined()
})

it('suggests the three closest locked milestones as next up', () => {
  const { next } = computeBadges(career({ goals: 9, assists: 8, wins: 1, sessions: 4 }))
  expect(next.map((b) => [b.id, b.value, b.target])).toEqual([
    ['goals_10', 9, 10], ['sessions_5', 4, 5], ['assists_10', 8, 10],
  ])
})

it('builds career numbers from session history rows', () => {
  const row = (o: Partial<SessionHistoryRow>) => ({
    played: 3, wins: 1, draws: 1, losses: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, awards: [], ...o,
  }) as SessionHistoryRow
  const c = careerFromHistory([
    row({ goals: 3, assists: 1, wins: 3, draws: 0, losses: 0, awards: ['mvp'] }),
    row({ goals: 1, assists: 3, cleanSheets: 2, awards: ['best_goalkeeper', 'mvp'] }),
    row({ played: 0, wins: 0, draws: 0, losses: 0 }),
  ], 1)
  expect(c).toEqual({
    goals: 4, assists: 4, wins: 4, sessions: 2, cleanSheets: 2,
    hatTricks: 1, playmakerSessions: 1, unbeatenSessions: 1,
    potmMonths: 1, mvpAwards: 2, gkAwards: 1,
  })
})
