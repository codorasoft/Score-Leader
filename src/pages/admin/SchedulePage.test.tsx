import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague } from '../../test/league'
import { db, resetDb, rows } from '../../test/fakeSupabase'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', async () => (await import('../../test/fakeSupabase')).supabaseModule)

import SchedulePage from './SchedulePage'

const item = (over: Record<string, unknown>) => ({
  league_id: 'L1', kind: 'task', title: 'Item', item_date: '2026-10-12', start_time: null, end_time: null, note: null,
  repeat_days: [], repeat_until: null, skipped_dates: [], done_dates: [], ...over,
})

// Today is Monday 12 October 2026
const data = () => ({
  schedule_items: [
    item({ id: 'gym', title: 'Gym', start_time: '08:00:00' }),
    item({ id: 'pitch', title: 'Book the pitch' }),
    item({ id: 'weekly', kind: 'training', title: 'Team training', item_date: '2026-10-04', start_time: '18:00:00', end_time: '19:30:00', repeat_days: [0, 2] }),
    item({ id: 'cup', kind: 'match', title: 'Cup final', item_date: '2026-10-16', start_time: '20:00:00' }),
    item({ id: 'nov', kind: 'other', title: 'Kit order', item_date: '2026-11-03' }),
    item({ id: 'theirs', league_id: 'L2', title: 'Not ours' }),
  ],
  sessions: [{ id: 's1', league_id: 'L1', date: '2026-10-12' }],
  trainings: [{ id: 'p1', league_id: 'L1', training_date: '2026-10-12', title: 'Passing day' }],
})

const renderPage = (features: readonly (typeof FEATURES)[number][] = FEATURES) =>
  render(<MemoryRouter><InLeague features={features}><SchedulePage /></InLeague></MemoryRouter>)

// Only the date is faked, so waiting for the page still works
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => vi.useRealTimers())

const ready = () => screen.findByRole('button', { name: /Gym/ })
const day = (label: RegExp) => screen.getByRole('button', { name: label })
const dayList = () => within(screen.getByRole('list', { name: /^Monday|^Tuesday|^Wednesday|^Thursday|^Friday|^Saturday|^Sunday/ }))
const listed = () => dayList().getAllByRole('listitem').map((li) => li.textContent)
const dialog = () => within(screen.getByRole('dialog'))
const itemWrites = () => db.writes.filter((w) => w.table === 'schedule_items')

describe('SchedulePage, the calendar', () => {
  it('opens on this month with today chosen, weeks starting on Monday in English', async () => {
    resetDb(data())
    renderPage()
    await ready()
    expect(screen.getByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    const today = day(/^Monday, October 12, 2026/)
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(today).toHaveAttribute('aria-current', 'date')
    // Whole weeks: the grid starts on Monday 28 September and ends on Sunday 1 November
    const cells = screen.getAllByRole('gridcell')
    expect(cells).toHaveLength(35)
    expect(within(cells[0]).getByRole('button')).toHaveAccessibleName(/^Monday, September 28, 2026/)
    expect(within(cells.at(-1)!).getByRole('button')).toHaveAccessibleName(/^Sunday, November 1, 2026/)
  })

  it("lists the chosen day: timed items by time, then all-day ones, then the app's own match session and plan", async () => {
    resetDb(data())
    renderPage()
    await ready()
    expect(listed()).toEqual([
      expect.stringMatching(/08:00.*Gym/),
      expect.stringMatching(/All day.*Book the pitch/),
      expect.stringMatching(/Match session/),
      expect.stringMatching(/Training plan.*Passing day/),
    ])
    expect(dayList().getByRole('link', { name: /Match session/ })).toHaveAttribute('href', '/admin/eagles/sessions/s1')
    expect(dayList().getByRole('link', { name: /Passing day/ })).toHaveAttribute('href', '/admin/eagles/trainings/p1')
    expect(screen.queryByText('Not ours')).not.toBeInTheDocument()
  })

  it('marks each day with one dot per kind of thing on it', async () => {
    resetDb(data())
    renderPage()
    await ready()
    const dots = (label: RegExp) => [...day(label).querySelectorAll('[data-dot]')].map((d) => d.getAttribute('data-dot'))
    expect(dots(/^Monday, October 12/)).toEqual(['session', 'plan', 'task'])
    expect(dots(/^Tuesday, October 13/)).toEqual(['training'])
    expect(dots(/^Friday, October 16/)).toEqual(['match'])
    expect(dots(/^Wednesday, October 14/)).toEqual([])
    // A repeating item is on every one of its weekdays, also in the days of the next month shown here
    expect(dots(/^Sunday, November 1/)).toEqual(['training'])
  })

  it('choosing a day lists that day, with a repeat mark on what repeats', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(day(/^Tuesday, October 13/))
    expect(day(/^Tuesday, October 13/)).toHaveAttribute('aria-pressed', 'true')
    expect(listed()).toEqual([expect.stringMatching(/18:00 – 19:30.*Team training/)])
    expect(dayList().getByLabelText('Repeats every week')).toBeInTheDocument()
    fireEvent.click(day(/^Wednesday, October 14/))
    expect(screen.getByText('Nothing on this day')).toBeInTheDocument()
  })

  it('moves to the next and previous month and back to today', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /^Tuesday, November 3, 2026/ }))
    await waitFor(() => expect(listed()).toEqual([expect.stringMatching(/Team training/), expect.stringMatching(/Kit order/)]))

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'September 2026' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument()
    expect(await ready()).toBeInTheDocument()
    expect(day(/^Monday, October 12, 2026/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('a league without training shows no plans and does not ask for them', async () => {
    resetDb(data())
    db.errors.trainings = { message: 'must not be asked' }
    renderPage(['schedule'])
    await ready()
    expect(screen.queryByText(/Passing day/)).not.toBeInTheDocument()
    expect(dayList().getByRole('link', { name: /Match session/ })).toBeInTheDocument()
  })

  it('offers a retry when the schedule cannot be loaded', async () => {
    resetDb(data())
    db.errors.schedule_items = { message: 'offline' }
    renderPage()
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    db.errors = {}
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await ready()).toBeInTheDocument()
  })
})

describe('SchedulePage, adding and changing items', () => {
  it('adds an item on the chosen day', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(day(/^Wednesday, October 14/))
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    expect(dialog().getByLabelText('Date')).toHaveValue('2026-10-14')
    expect(dialog().getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.click(dialog().getByRole('button', { name: 'Match' }))
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: '  Friendly   match ' } })
    fireEvent.change(dialog().getByLabelText('Start'), { target: { value: '19:00' } })
    fireEvent.change(dialog().getByLabelText('Note'), { target: { value: ' Away kit ' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(itemWrites().at(-1)).toMatchObject({
      op: 'insert',
      values: {
        league_id: 'L1', kind: 'match', title: 'Friendly match', item_date: '2026-10-14', start_time: '19:00', end_time: null,
        note: 'Away kit', repeat_days: [], repeat_until: null,
      },
    })
    await waitFor(() => expect(listed()).toEqual([expect.stringMatching(/19:00.*Friendly match/)]))
  })

  it('adds an item that repeats on chosen weekdays until a last day', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Recovery' } })
    // No last day to choose until it repeats
    expect(dialog().queryByLabelText('Until (optional)')).not.toBeInTheDocument()
    const repeat = within(dialog().getByRole('group', { name: 'Repeat every week on' }))
    expect(repeat.getAllByRole('button').map((b) => b.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    fireEvent.click(repeat.getByRole('button', { name: 'Thu' }))
    fireEvent.click(repeat.getByRole('button', { name: 'Mon' }))
    fireEvent.change(dialog().getByLabelText('Until (optional)'), { target: { value: '2026-10-31' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(itemWrites().at(-1)).toMatchObject({ values: { title: 'Recovery', item_date: '2026-10-12', repeat_days: [1, 4], repeat_until: '2026-10-31' } })
    fireEvent.click(day(/^Thursday, October 15/))
    await waitFor(() => expect(listed()).toEqual([expect.stringMatching(/Recovery/)]))
    fireEvent.click(day(/^Monday, October 26/))
    expect(listed()).toEqual([expect.stringMatching(/Recovery/)])
  })

  it('will not save an end that is not after the start, or a last day before the first', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Gym' } })
    fireEvent.change(dialog().getByLabelText('Start'), { target: { value: '10:00' } })
    fireEvent.change(dialog().getByLabelText('End'), { target: { value: '09:00' } })
    expect(dialog().getByText('The end must be after the start.')).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(dialog().getByLabelText('End'), { target: { value: '11:00' } })
    expect(dialog().getByRole('button', { name: 'Save' })).toBeEnabled()

    fireEvent.click(within(dialog().getByRole('group', { name: 'Repeat every week on' })).getByRole('button', { name: 'Mon' }))
    fireEvent.change(dialog().getByLabelText('Until (optional)'), { target: { value: '2026-10-01' } })
    expect(dialog().getByText('The last day cannot be before the first.')).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a refused save keeps the form open as typed', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Gym again' } })
    db.errors.schedule_items = { message: 'new row violates row-level security policy' }
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dialog().getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(dialog().getByLabelText('Title')).toHaveValue('Gym again')
  })

  it('tapping an item opens it filled in, and saving changes it', async () => {
    resetDb(data())
    renderPage()
    fireEvent.click(await ready())
    expect(dialog().getByLabelText('Title')).toHaveValue('Gym')
    expect(dialog().getByLabelText('Start')).toHaveValue('08:00')
    expect(dialog().getByRole('button', { name: 'Task' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Gym, legs' } })
    fireEvent.change(dialog().getByLabelText('End'), { target: { value: '09:00' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows('schedule_items').find((r) => r.id === 'gym')).toMatchObject({ title: 'Gym, legs', end_time: '09:00', league_id: 'L1' })
    await waitFor(() => expect(listed()[0]).toMatch(/08:00 – 09:00.*Gym, legs/))
  })

  it('deletes a plain item after asking', async () => {
    resetDb(data())
    renderPage()
    fireEvent.click(await ready())
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    expect(dialog().getByText('Delete “Gym”?')).toBeInTheDocument()
    expect(rows('schedule_items').map((r) => r.id)).toContain('gym')
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows('schedule_items').map((r) => r.id)).not.toContain('gym')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Gym/ })).not.toBeInTheDocument())
  })

  it('deletes only one day of a repeating item, and its other days stay', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(day(/^Tuesday, October 13/))
    fireEvent.click(dayList().getByRole('button', { name: /Team training/ }))
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    expect(dialog().getByText('“Team training” repeats. Delete only this day, or all days?')).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: 'Only this day' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows('schedule_items').find((r) => r.id === 'weekly')).toMatchObject({ skipped_dates: ['2026-10-13'] })
    await waitFor(() => expect(screen.getByText('Nothing on this day')).toBeInTheDocument())
    fireEvent.click(day(/^Sunday, October 18/))
    expect(listed()).toEqual([expect.stringMatching(/Team training/)])
  })

  it('deletes every day of a repeating item', async () => {
    resetDb(data())
    renderPage()
    await ready()
    fireEvent.click(day(/^Tuesday, October 13/))
    fireEvent.click(dayList().getByRole('button', { name: /Team training/ }))
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    fireEvent.click(dialog().getByRole('button', { name: 'All days' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rows('schedule_items').map((r) => r.id)).not.toContain('weekly')
  })

  it('a task is ticked for the day it was done on', async () => {
    resetDb(data())
    renderPage()
    await ready()
    const tick = dayList().getByRole('checkbox', { name: 'Done: Book the pitch' })
    expect(tick).not.toBeChecked()
    // Only tasks can be ticked
    expect(dayList().getAllByRole('checkbox')).toHaveLength(2)
    fireEvent.click(tick)
    await waitFor(() => expect(rows('schedule_items').find((r) => r.id === 'pitch')).toMatchObject({ done_dates: ['2026-10-12'] }))
    await waitFor(() => expect(dayList().getByRole('checkbox', { name: 'Done: Book the pitch' })).toBeChecked())
    // The tick box is off while the change is being saved
    await waitFor(() => expect(dayList().getByRole('checkbox', { name: 'Done: Book the pitch' })).toBeEnabled())
    fireEvent.click(dayList().getByRole('checkbox', { name: 'Done: Book the pitch' }))
    await waitFor(() => expect(rows('schedule_items').find((r) => r.id === 'pitch')).toMatchObject({ done_dates: [] }))
  })
})
