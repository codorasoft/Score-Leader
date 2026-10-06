import { render } from '@testing-library/react'
import { PlayerCardView } from './PlayerCardView'
import { InLeague } from '../test/league'
import type { Player } from '../lib/types'
import type { PlayerCard } from '../utils/playerCard'

const player = { id: 'p', name: 'Sam', position: 'MID', photo_url: 'http://x/p.jpg' } as Player
const card = { tier: 'gold', overall: 80, isNew: false, attributes: [] } as unknown as PlayerCard

it('renders no photo when photos is off', () => {
  const { container } = render(<InLeague features={['player_cards']}><PlayerCardView player={player} card={card} /></InLeague>)
  expect(container.querySelector('img')).toBeNull()
  expect(container).toHaveTextContent('S')
})

it('renders the photo when photos is on', () => {
  const { container } = render(<InLeague features={['photos']}><PlayerCardView player={player} card={card} /></InLeague>)
  expect(container.querySelector('img')).not.toBeNull()
})
