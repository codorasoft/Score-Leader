import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../test/league'
import { inArabic } from '../test/arabic'
import type { TodayRow } from '../utils/schedule'
import TodayDialog from './TodayDialog'

const rows: TodayRow[] = [
  { kind: 'item', id: 'gym', dot: 'training', time: '08:00 – 09:30', title: 'Gym' },
  { kind: 'item', id: 'pitch', dot: 'task', time: null, title: 'حجز الملعب' },
  { kind: 'session', id: 's1', dot: 'session', time: null, title: null },
  { kind: 'plan', id: 'p1', dot: 'plan', time: null, title: 'Passing day' },
  { kind: 'plan', id: 'p2', dot: 'plan', time: null, title: null },
]
const onClose = vi.fn()
const open = () => {
  onClose.mockClear()
  render(<MemoryRouter><InLeague><TodayDialog date="2026-10-13" rows={rows} onClose={onClose} /></InLeague></MemoryRouter>)
  return screen.getByRole('dialog', { name: 'Today' })
}
const links = (dialog: HTMLElement) => within(within(dialog).getByRole('list')).getAllByRole('link')

it('names the day and lists the rows as links to their pages', () => {
  const dialog = open()
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(within(dialog).getByText('Tuesday, October 13, 2026')).toBeInTheDocument()
  expect(links(dialog).map((l) => l.getAttribute('href'))).toEqual([
    '/admin/eagles/schedule', '/admin/eagles/schedule', '/admin/eagles/sessions/s1', '/admin/eagles/trainings/p1', '/admin/eagles/trainings/p2',
  ])
  expect(links(dialog).map((l) => l.textContent)).toEqual([
    '08:00 – 09:30Gym', 'All dayحجز الملعب', 'All dayMatch session', 'Training planPassing day', 'Training plan',
  ])
  expect(within(dialog).getByRole('link', { name: 'Open schedule' })).toHaveAttribute('href', '/admin/eagles/schedule')
})

it('a title follows its own writing direction', () => {
  const dialog = open()
  expect(within(dialog).getByText('حجز الملعب')).toHaveAttribute('dir', 'auto')
  expect(within(dialog).getByText('Passing day')).toHaveAttribute('dir', 'auto')
})

it('starts on Got it, and Tab stays inside', () => {
  const dialog = open()
  const gotIt = within(dialog).getByRole('button', { name: 'Got it' })
  expect(gotIt).toHaveFocus()
  fireEvent.keyDown(gotIt, { key: 'Tab' })
  expect(links(dialog)[0]).toHaveFocus()
  fireEvent.keyDown(links(dialog)[0], { key: 'Tab', shiftKey: true })
  expect(gotIt).toHaveFocus()
})

it.each([
  ['Got it', (d: HTMLElement) => fireEvent.click(within(d).getByRole('button', { name: 'Got it' }))],
  ['Escape', (d: HTMLElement) => fireEvent.keyDown(d, { key: 'Escape' })],
  ['a tap outside', (d: HTMLElement) => fireEvent.click(d.parentElement!)],
  ['Open schedule', (d: HTMLElement) => fireEvent.click(within(d).getByRole('link', { name: 'Open schedule' }))],
  ['a row', (d: HTMLElement) => fireEvent.click(links(d)[2])],
])('%s closes it', (_name, close) => {
  close(open())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('a tap inside does not close it', () => {
  fireEvent.click(within(open()).getByText('Tuesday, October 13, 2026'))
  expect(onClose).not.toHaveBeenCalled()
})

it('speaks Arabic', async () => {
  await inArabic(() => {
    render(<MemoryRouter><InLeague><TodayDialog date="2026-10-13" rows={rows} onClose={onClose} /></InLeague></MemoryRouter>)
    const dialog = screen.getByRole('dialog', { name: 'اليوم' })
    expect(within(dialog).getByRole('button', { name: 'حسناً' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'فتح الجدول' })).toBeInTheDocument()
  })
})
