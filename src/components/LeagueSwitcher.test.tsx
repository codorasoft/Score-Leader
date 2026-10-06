import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

it('moves focus through the menu with the arrow keys', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin/eagles/players']}>
      <LeagueSwitcher current={leagues[0]} leagues={leagues} maxLeagues={3} />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: /EAGLES/ }))
  const items = screen.getAllByRole('menuitem')
  expect(items[0]).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(items[1]).toHaveFocus()
  await user.keyboard('{End}')
  expect(items[items.length - 1]).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(items[0]).toHaveFocus()
  await user.keyboard('{ArrowUp}')
  expect(items[items.length - 1]).toHaveFocus()
  await user.keyboard('{Home}')
  expect(items[0]).toHaveFocus()
})

it('closes on Escape and returns focus to the switcher button', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin/eagles/players']}>
      <LeagueSwitcher current={leagues[0]} leagues={leagues} maxLeagues={3} />
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: /EAGLES/ })
  await user.click(button)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).toBeNull()
  expect(button).toHaveFocus()
  expect(button).toHaveAttribute('aria-expanded', 'false')
})

it('marks the current league', () => {
  open(3)
  expect(screen.getByRole('menuitem', { name: /EAGLES/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('menuitem', { name: /TIGERS/ })).not.toHaveAttribute('aria-current')
})
