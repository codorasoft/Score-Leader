import { render, screen } from '@testing-library/react'
import { NextUp } from './NextUp'
import { team } from '../test/fixtures'

const teams = [team('tg', 's1', 'green'), team('tb', 's1', 'blue'), team('to', 's1', 'orange'), team('tp', 's1', 'purple')]

it('shows nothing when no team is waiting (two teams)', () => {
  const { container } = render(<NextUp queue={[]} teams={teams} />)
  expect(container).toBeEmptyDOMElement()
})

it('names the team that comes on next', () => {
  render(<NextUp queue={['to']} teams={teams} />)
  expect(screen.getByText('Next up: Orange Team')).toBeInTheDocument()
})

it('names the teams after it in order', () => {
  render(<NextUp queue={['to', 'tp', 'tb']} teams={teams} />)
  expect(screen.getByText('Next up: Orange Team, then Purple Team, Blue Team')).toBeInTheDocument()
})
