import i18n from 'i18next'
import { buildSessionSummary } from './sessionSummary'
import type { Match, MatchEvent, Player, SessionAward, Team } from '../lib/types'

const teams = (['green', 'blue', 'yellow'] as const).map((color) => ({ id: color, session_id: 's', color, name: null })) as Team[]
const players = ['Ali', 'Omar', 'Sami', 'Hadi'].map((name) => ({ id: name, name }) as Player)
const match = (id: string, team1_id: string, team2_id: string, team1_score: number, team2_score: number, status = 'completed') =>
  ({ id, team1_id, team2_id, team1_score, team2_score, status }) as Match
const ev = (id: string, match_id: string, player_id: string, event_type: MatchEvent['event_type']) =>
  ({ id, match_id, player_id, event_type }) as MatchEvent
const award = (award_type: SessionAward['award_type'], winner_player_id: string, is_tied = false) =>
  ({ award_type, winner_player_id, is_tied }) as SessionAward

it('builds a plain-text summary with standings, top players, awards and the link', () => {
  const text = buildSessionSummary({
    t: i18n.t.bind(i18n),
    date: '2026-10-04',
    teams,
    players,
    matches: [match('m1', 'green', 'blue', 2, 0), match('m2', 'green', 'yellow', 1, 1), match('m3', 'blue', 'yellow', 0, 0, 'pending')],
    events: [
      ev('1', 'm1', 'Ali', 'goal'), ev('2', 'm1', 'Ali', 'goal'), ev('3', 'm1', 'Omar', 'assist'),
      ev('4', 'm2', 'Sami', 'goal'), ev('5', 'm2', 'Hadi', 'goal'),
    ],
    awards: [award('best_assister', 'Omar'), award('mvp', 'Ali'), award('best_goalscorer', 'Ali')],
    url: 'https://example.app/s/abc',
  })

  expect(text).toBe([
    '⚽ ScoreLeader · 2026-10-04',
    '2 matches · 4 goals',
    '',
    '🏆 Team standings',
    '🥇 Green Team — 1W · 1D · 0L (3–1)',
    '🥈 Yellow Team — 0W · 1D · 0L (1–1)',
    '🥉 Blue Team — 0W · 0D · 1L (0–2)',
    '',
    '⚽ Top scorers',
    '🥇 Ali — 2',
    '🥈 Sami, Hadi — 1',
    '',
    '🎯 Top assists',
    '🥇 Omar — 1',
    '',
    '🏅 Session Awards',
    '⭐ MVP: Ali',
    '⚽ Best Goalscorer: Ali',
    '🎯 Best Assister: Omar',
    '',
    '📊 Full details: https://example.app/s/abc',
  ].join('\n'))
})

it('marks tied awards and leaves out empty sections', () => {
  const text = buildSessionSummary({
    t: i18n.t.bind(i18n), date: '2026-10-04', teams, players,
    matches: [match('m1', 'green', 'blue', 0, 0)], events: [],
    awards: [award('best_assister', 'Omar', true)], url: 'u',
  })
  expect(text).toContain('🎯 Best Assister: Omar (tied)')
  expect(text).not.toContain('Top scorers')
  expect(text).not.toContain('Top assists')
})
