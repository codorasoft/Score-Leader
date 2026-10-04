import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamSwapBoard } from './TeamSwapBoard'
import type { Player } from '../lib/types'

const p = (name: string, skill_rating = 3) => ({ id: name, name, position: 'MID', skill_rating }) as Player

function Harness() {
  const [teams, setTeams] = useState<[Player[], Player[], Player[]]>([[p('Ali', 5), p('Omar')], [p('Sami', 1)], [p('Hadi')]])
  return (
    <>
      <TeamSwapBoard teams={teams} onChange={setTeams} />
      <output data-testid="state">{teams.map((t) => t.map((x) => x.name).join(',')).join(' | ')}</output>
    </>
  )
}

const state = () => screen.getByTestId('state').textContent

it('swaps two players by tapping one and then a player on another team', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Ali/ }))
  fireEvent.click(screen.getByRole('button', { name: /Sami/ }))
  expect(state()).toBe('Sami,Omar | Ali | Hadi')
})

it('moves the selected player to another team with Move here', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Omar/ }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Move here' })[1])
  expect(state()).toBe('Ali | Sami | Hadi,Omar')
})

it('tapping the selected player again cancels the selection', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Ali/ }))
  fireEvent.click(screen.getByRole('button', { name: /Ali/ }))
  expect(screen.queryByRole('button', { name: 'Move here' })).not.toBeInTheDocument()
})

it('shows each team\'s player count and total stars', () => {
  render(<Harness />)
  expect(screen.getByText('2 players · 8★')).toBeInTheDocument()
  expect(screen.getByText('1 player · 1★')).toBeInTheDocument()
  expect(screen.getByText('1 player · 3★')).toBeInTheDocument()
})
