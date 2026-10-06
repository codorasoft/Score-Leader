import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LeagueSwitcher } from './LeagueSwitcher'
import type { League } from '../lib/tenancy'

const lg = (slug: string): League => ({ id: slug, owner_id: 'u', name: slug.toUpperCase(), slug, logo_url: null, created_at: '' })
const leagues = [lg('eagles'), lg('tigers')]

function open(maxLeagues: number) {
  render(
    <MemoryRouter initialEntries={['/admin/eagles/players']}>
      <LeagueSwitcher current={leagues[0]} leagues={leagues} maxLeagues={maxLeagues} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /EAGLES/ }))
}

it('disables new league at the limit', () => {
  open(2)
  expect(screen.getByText('League limit reached (2/2)')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /New league/ })).toBeNull()
  expect(screen.getByRole('menuitem', { name: /League limit reached/ })).toHaveAttribute('aria-disabled', 'true')
})

it('links to new league under the limit', () => {
  open(3)
  expect(screen.getByRole('menuitem', { name: /New league \(2\/3\)/ })).toHaveAttribute('href', '/admin/leagues/new')
})
