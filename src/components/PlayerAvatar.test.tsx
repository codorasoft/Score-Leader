import { render } from '@testing-library/react'
import { PlayerAvatar } from './PlayerAvatar'
import { InLeague } from '../test/league'
import { FEATURES } from '../lib/features'

const player = { name: 'Ali', photo_url: 'https://x/p.jpg' }

it('shows the photo outside a league provider', () => {
  const { container } = render(<PlayerAvatar player={player} />)
  expect(container.querySelector('img')).not.toBeNull()
})

it('shows the photo when the league has photos', () => {
  const { container } = render(<InLeague><PlayerAvatar player={player} /></InLeague>)
  expect(container.querySelector('img')).not.toBeNull()
})

it('shows the initial instead when the league lacks photos', () => {
  const { container } = render(<InLeague features={FEATURES.filter((f) => f !== 'photos')}><PlayerAvatar player={player} /></InLeague>)
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toBe('A')
})
