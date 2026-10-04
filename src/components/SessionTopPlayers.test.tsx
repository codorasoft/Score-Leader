import { render, screen, within } from '@testing-library/react'
import { SessionTopPlayers } from './SessionTopPlayers'
import type { Match, MatchEvent, Player } from '../lib/types'

const players = ['Ali', 'Omar', 'Sami'].map((name) => ({ id: name, name }) as Player)
const matches = [{ id: 'm1', status: 'completed' }] as Match[]
const ev = (id: string, player_id: string, event_type: MatchEvent['event_type']) => ({ id, player_id, event_type, match_id: 'm1' }) as MatchEvent

it('shows the top scorers and top assisters with medals and counts', () => {
  render(<SessionTopPlayers players={players} matches={matches} events={[
    ev('1', 'Ali', 'goal'), ev('2', 'Ali', 'goal'), ev('3', 'Omar', 'goal'), ev('4', 'Sami', 'assist'),
  ]} />)
  const scorers = screen.getByRole('heading', { name: /Top scorers/ }).parentElement!
  const items = within(scorers).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('🥇Ali2goals')
  expect(items[1]).toHaveTextContent('🥈Omar1goal')
  const assists = screen.getByRole('heading', { name: /Top assists/ }).parentElement!
  expect(within(assists).getByRole('listitem')).toHaveTextContent('🥇Sami1assist')
})

it('renders nothing when nobody has scored or assisted', () => {
  const { container } = render(<SessionTopPlayers players={players} matches={matches} events={[]} />)
  expect(container).toBeEmptyDOMElement()
})
