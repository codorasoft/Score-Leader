import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { MatchResultDialog } from './MatchResultDialog'
import type { Team } from '../lib/types'
import { PRESETS } from '../utils/matchFormat'

const red: Team = { id: 'red', session_id: 's', color: 'green', name: null }
const blue: Team = { id: 'blue', session_id: 's', color: 'blue', name: null }
const yellow: Team = { id: 'yellow', session_id: 's', color: 'yellow', name: null }
const next = { team1: red, team2: yellow, queue: [blue] }

it('names the winner, explains why, and continues on the button', () => {
  const onContinue = vi.fn()
  render(
    <MatchResultDialog
      outcome={{ isDraw: false, winnerTeamId: 'red', reason: 'goalLimit' }}
      team1={{ team: red, score: 2 }} team2={{ team: blue, score: 1 }}
      format={PRESETS.quick} next={next} onContinue={onContinue}
    />,
  )
  expect(screen.getByRole('heading')).toHaveTextContent('Green Team wins!')
  expect(screen.getByText('Green Team was first to score 2 goals.')).toBeInTheDocument()
  expect(screen.getByText(/Next: Green Team vs Yellow Team/)).toBeInTheDocument()
  expect(screen.getByText('Next up: Blue Team')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onContinue).toHaveBeenCalledTimes(1)
})

it('shows the penalty shootout score with the winner first', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: true, winnerTeamId: 'blue', reason: 'penalties', penaltyScore: { winner: 4, loser: 3 } }}
      team1={{ team: red, score: 1 }} team2={{ team: blue, score: 1 }}
      format={PRESETS.quick} next={next} onContinue={vi.fn()}
    />,
  )
  expect(screen.getByText('Blue Team won the penalty shootout 4–3.')).toBeInTheDocument()
})

it('names the challenger as winner of a later-match draw and explains the previous winner loses', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: true, winnerTeamId: 'blue', loserTeamId: 'red', reason: 'drawPreviousWinnerLoses' }}
      team1={{ team: red, score: 1 }} team2={{ team: blue, score: 1 }}
      format={PRESETS.quick} next={next} onContinue={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading')).toHaveTextContent('Blue Team wins!')
  expect(screen.getByText('Draw. Green Team won the last match, so a draw counts as a loss for them. Blue Team stays on.')).toBeInTheDocument()
})

it('shows nobody waiting with two teams', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: false, winnerTeamId: 'red', reason: 'goalLimit' }}
      team1={{ team: red, score: 2 }} team2={{ team: blue, score: 1 }}
      format={PRESETS.quick} next={{ team1: red, team2: blue, queue: [] }} onContinue={vi.fn()}
    />,
  )
  expect(screen.queryByText(/Next up/)).not.toBeInTheDocument()
})

it('shows a true draw without a winner title', () => {
  render(
    <MatchResultDialog
      outcome={{ isDraw: true, winnerTeamId: null, reason: 'draw' }}
      team1={{ team: red, score: 1 }} team2={{ team: blue, score: 1 }}
      format={PRESETS.halves} next={next} onContinue={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading')).toHaveTextContent("It's a draw")
  expect(screen.getByText('The match ended level. The next match is shown below.')).toBeInTheDocument()
  expect(screen.queryByText(/wins!/)).not.toBeInTheDocument()
  expect(screen.queryByText(/both teams go off/)).not.toBeInTheDocument()
  expect(screen.queryByText('🏆')).not.toBeInTheDocument()
})
