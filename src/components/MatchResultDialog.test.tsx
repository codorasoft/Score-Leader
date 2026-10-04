import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { MatchResultDialog } from './MatchResultDialog'
import type { Team } from '../lib/types'

const red: Team = { id: 'red', session_id: 's', color: 'red', name: null }
const blue: Team = { id: 'blue', session_id: 's', color: 'blue', name: null }
const yellow: Team = { id: 'yellow', session_id: 's', color: 'yellow', name: null }
const next = { team1: red, team2: yellow, waiting: blue }

it('names the winner, explains why, and continues on the button', () => {
  const onContinue = vi.fn()
  render(
    <MatchResultDialog
      outcome={{ isDraw: false, winnerTeamId: 'red', reason: 'goalLimit' }}
      team1={{ team: red, score: 2 }} team2={{ team: blue, score: 1 }}
      next={next} onContinue={onContinue}
    />,
  )
  expect(screen.getByRole('heading')).toHaveTextContent('Red Team wins!')
  expect(screen.getByText('Red Team was first to score 2 goals.')).toBeInTheDocument()
  expect(screen.getByText(/Next: Red Team vs Yellow Team/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onContinue).toHaveBeenCalledTimes(1)
})

it('shows the penalty shootout score with the winner first', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: true, winnerTeamId: 'blue', reason: 'penalties', penaltyScore: { winner: 4, loser: 3 } }}
      team1={{ team: red, score: 1 }} team2={{ team: blue, score: 1 }}
      next={next} onContinue={vi.fn()}
    />,
  )
  expect(screen.getByText('Blue Team won the penalty shootout 4–3.')).toBeInTheDocument()
})

it('names the challenger as winner of a later-match draw and explains the previous winner loses', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: true, winnerTeamId: 'blue', loserTeamId: 'red', reason: 'drawPreviousWinnerLoses' }}
      team1={{ team: red, score: 1 }} team2={{ team: blue, score: 1 }}
      next={next} onContinue={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading')).toHaveTextContent('Blue Team wins!')
  expect(screen.getByText('Draw. Red Team won the last match, so a draw counts as a loss for them. Blue Team stays on.')).toBeInTheDocument()
})
