import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BackLink, backTo } from './BackLink'
import { inArabic } from '../test/arabic'

const renderAt = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/eagles/sessions/s1', state }]}>
      <BackLink to="/admin/eagles/history" labelKey="nav.history" />
    </MemoryRouter>,
  )

it("leads to the page's own parent when opened directly", () => {
  renderAt()
  expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('href', '/admin/eagles/history')
})

it('leads back to the page it was opened from', () => {
  renderAt(backTo({ to: '/admin/eagles/home', labelKey: 'nav.home' }))
  expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/admin/eagles/home')
})

it('shows a name as given', () => {
  renderAt(backTo({ to: '/admin/eagles/coach/players/p1', label: 'مهند تركي' }))
  expect(screen.getByRole('link', { name: /مهند تركي/ })).toHaveAttribute('href', '/admin/eagles/coach/players/p1')
})

it('turns its arrow round and translates its label in Arabic', async () => {
  await inArabic(() => {
    renderAt()
    const link = screen.getByRole('link', { name: /السجل/ })
    expect(link.querySelector('[aria-hidden="true"]')).toHaveClass('rtl:-scale-x-100')
  })
})
