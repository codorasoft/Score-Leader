import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PublicLayout from './PublicLayout'
import { InLeague } from '../test/league'

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
