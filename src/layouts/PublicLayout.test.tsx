import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const h = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: h.user, loading: false }) }))

import PublicLayout from './PublicLayout'
import { InLeague } from '../test/league'

beforeEach(() => { h.user = null })

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <InLeague><PublicLayout /></InLeague>
  </MemoryRouter>,
)

it('a signed-in admin gets a Home button back to the admin pages', () => {
  h.user = { id: 'u1' }
  renderAt('/l/eagles/leaderboard')
  const links = screen.getAllByRole('link', { name: /Home/ })
  expect(links.length).toBeGreaterThan(0)
  links.forEach((l) => expect(l).toHaveAttribute('href', '/admin/eagles/home'))
})

it('visitors who are not signed in see no Home button', () => {
  renderAt('/l/eagles/leaderboard')
  expect(screen.queryByRole('link', { name: /Home/ })).toBeNull()
})

it('shows only nav links for enabled features, under the league path', () => {
  render(
    <MemoryRouter initialEntries={['/l/eagles']}>
      <InLeague features={['records']}><PublicLayout /></InLeague>
    </MemoryRouter>,
  )
  const links = screen.getAllByRole('link', { name: 'Records' })
  expect(links.length).toBeGreaterThan(0)
  links.forEach((l) => expect(l).toHaveAttribute('href', '/l/eagles/records'))
  expect(screen.queryByRole('link', { name: 'Leaderboard' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Cards' })).toBeNull()
  expect(screen.getByRole('link', { name: /Eagles/ })).toHaveAttribute('href', '/l/eagles')
})
