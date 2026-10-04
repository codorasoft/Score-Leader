import { describeOutcome } from './matchOutcome'

const base = {
  team1_id: 'red', team2_id: 'blue',
  team1_score: 0, team2_score: 0,
  is_draw: false, draw_resolved_by: null, winner_team_id: 'red',
  elapsedSeconds: 200,
} as const

it('explains a win by reaching the goal limit, even if time also ran out', () => {
  expect(describeOutcome({ ...base, team2_score: 2, team1_score: 1, winner_team_id: 'blue', elapsedSeconds: 500 }))
    .toEqual({ isDraw: false, winnerTeamId: 'blue', reason: 'goalLimit' })
})

it('explains a win by being ahead when the time ran out', () => {
  expect(describeOutcome({ ...base, team1_score: 1, elapsedSeconds: 420 }))
    .toEqual({ isDraw: false, winnerTeamId: 'red', reason: 'timeUp' })
})

it('explains a win by being ahead when the admin ended the match early', () => {
  expect(describeOutcome({ ...base, team1_score: 1, elapsedSeconds: 300 }))
    .toEqual({ isDraw: false, winnerTeamId: 'red', reason: 'endedEarly' })
})

it('explains a penalty shootout win with the winner\'s score first', () => {
  expect(describeOutcome({
    ...base, team1_score: 1, team2_score: 1, is_draw: true, draw_resolved_by: 'penalties',
    winner_team_id: 'blue', penalties: { team1: 2, team2: 3 },
  })).toEqual({ isDraw: true, winnerTeamId: 'blue', reason: 'penalties', penaltyScore: { winner: 3, loser: 2 } })
})

it('explains a later-match draw as a loss for the previous winner (team1)', () => {
  expect(describeOutcome({ ...base, team1_score: 1, team2_score: 1, is_draw: true, draw_resolved_by: 'late_team', winner_team_id: 'blue' }))
    .toEqual({ isDraw: true, winnerTeamId: 'blue', loserTeamId: 'red', reason: 'drawPreviousWinnerLoses' })
})
