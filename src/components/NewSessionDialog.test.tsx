import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import { format } from 'date-fns'
import { InLeague } from '../test/league'
import { db, resetDb, rows } from '../test/fakeSupabase'
import { session } from '../test/fixtures'
import { PRESETS } from '../utils/matchFormat'

vi.mock('../lib/supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import { NewSessionDialog } from './NewSessionDialog'

function AttendanceStub() {
  const { sessionId } = useParams()
  return <p>attendance {sessionId}</p>
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/admin/eagles/home']}><InLeague>
      <Routes>
        <Route path="/admin/eagles/home" element={<NewSessionDialog onClose={onClose} />} />
        <Route path="/admin/eagles/sessions/:sessionId/players" element={<AttendanceStub />} />
      </Routes>
    </InLeague></MemoryRouter>,
  )
  return onClose
}

const teamsValue = () => screen.getByLabelText('Number of teams')
const perTeamValue = () => screen.getByLabelText('Players per team')

it('is a named dialog that starts on today with 3 teams of 5 for a new league', async () => {
  resetDb()
  renderDialog()
  expect(screen.getByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  expect(screen.getByLabelText('Date')).toHaveValue(format(new Date(), 'yyyy-MM-dd'))
  await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
  expect(perTeamValue()).toHaveTextContent('5')
  expect(screen.getByText('Up to 15 players')).toBeInTheDocument()
})

it("starts from the league's last session setup", async () => {
  resetDb({ sessions: [
    { ...session, id: 'old', created_at: '2026-09-01T10:00:00Z', team_count: 3, team_size: 5 },
    { ...session, id: 'new', created_at: '2026-10-01T10:00:00Z', team_count: 4, team_size: 6 },
    { ...session, id: 'other', league_id: 'L2', created_at: '2026-10-05T10:00:00Z', team_count: 2, team_size: 3 },
  ] })
  renderDialog()
  await waitFor(() => expect(teamsValue()).toHaveTextContent('4'))
  expect(perTeamValue()).toHaveTextContent('6')
  expect(screen.getByText('Up to 24 players')).toBeInTheDocument()
})

it('keeps the numbers within 2–6 teams and 3–11 players per team', async () => {
  resetDb()
  const user = userEvent.setup()
  renderDialog()
  await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
  for (let i = 0; i < 6; i++) await user.click(screen.getByRole('button', { name: 'Fewer teams' }))
  expect(teamsValue()).toHaveTextContent('2')
  expect(screen.getByRole('button', { name: 'Fewer teams' })).toHaveAttribute('aria-disabled', 'true')
  for (let i = 0; i < 6; i++) await user.click(screen.getByRole('button', { name: 'More teams' }))
  expect(teamsValue()).toHaveTextContent('6')
  expect(screen.getByRole('button', { name: 'More teams' })).toHaveAttribute('aria-disabled', 'true')
  for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'More players per team' }))
  expect(perTeamValue()).toHaveTextContent('11')
  for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Fewer players per team' }))
  expect(perTeamValue()).toHaveTextContent('3')
  expect(screen.getByText('Up to 18 players')).toBeInTheDocument()
})

it('creates the session with its setup and opens attendance', async () => {
  resetDb()
  const user = userEvent.setup()
  renderDialog()
  await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
  await user.click(screen.getByRole('button', { name: 'More teams' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  const created = rows('sessions')[0]
  expect(created).toMatchObject({ league_id: 'L1', status: 'draft', team_count: 4, team_size: 5, date: format(new Date(), 'yyyy-MM-dd') })
  expect(await screen.findByText(`attendance ${created.id}`)).toBeInTheDocument()
})

it('cancel and Escape close without saving anything', async () => {
  resetDb()
  const user = userEvent.setup()
  const onClose = renderDialog()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(2)
  expect(rows('sessions')).toEqual([])
})

it('stays open with the error when the session cannot be saved', async () => {
  resetDb()
  const user = userEvent.setup()
  const onClose = renderDialog()
  await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
  db.errors.sessions = { message: 'Failed to fetch' }
  await user.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  expect(screen.getByRole('dialog', { name: 'New session' })).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

describe('polish', () => {
  const hold = () => {
    let release = () => {}
    const p = new Promise<void>((r) => { release = r })
    return { p, release }
  }

  it('cannot be cancelled while the session is being saved', async () => {
    resetDb()
    const user = userEvent.setup()
    const onClose = renderDialog()
    await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
    const saving = hold()
    db.holds.sessions = saving.p
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    saving.release()
    expect(await screen.findByText(/^attendance/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps keyboard focus on a stepper button that reaches its limit', async () => {
    resetDb()
    const user = userEvent.setup()
    const onClose = renderDialog()
    await waitFor(() => expect(teamsValue()).toHaveTextContent('3'))
    const more = screen.getByRole('button', { name: 'More teams' })
    more.focus()
    for (let i = 0; i < 5; i++) await user.keyboard('{Enter}')
    expect(teamsValue()).toHaveTextContent('6')
    expect(more).toHaveFocus()
    expect(more).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter}')
    expect(teamsValue()).toHaveTextContent('6')
    // Still inside the dialog, so Escape works
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does not overwrite a choice made before the last session's setup arrives", async () => {
    resetDb({ sessions: [{ ...session, id: 'last', team_count: 4, team_size: 6 }] })
    const loading = hold()
    db.holds.sessions = loading.p
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Fewer teams' }))
    expect(teamsValue()).toHaveTextContent('2')
    loading.release()
    await new Promise((r) => setTimeout(r, 20))
    expect(teamsValue()).toHaveTextContent('2')
    expect(perTeamValue()).toHaveTextContent('5')
  })
})

describe('match format', () => {
  it('offers Quick, Halves and Knockout; Quick is selected by default and the line describes it', async () => {
    resetDb()
    renderDialog()
    expect(screen.getByRole('radio', { name: 'Quick' })).toBeChecked()
    expect(screen.getByText('1 × 7 min · first to 2 · draw: team already on goes off')).toBeInTheDocument()
  })

  it('Halves fills the fields and the line; editing a number shows Custom', async () => {
    resetDb()
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Halves' }))
    expect(screen.getByText('2 × 10 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More minutes' }))
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
    expect(screen.getByText('2 × 11 min · no goal limit · a draw stays a draw')).toBeInTheDocument()
  })

  it('Knockout turns penalties on and disables the draw rule', async () => {
    resetDb()
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Knockout' }))
    expect(screen.getByRole('switch', { name: 'Penalties' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Draw stands, both go off' })).toBeDisabled()
  })

  it('saves the six format values with the session', async () => {
    resetDb()
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Halves' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(rows('sessions')[0]).toMatchObject({ period_count: 2, period_minutes: 10, extra_time_minutes: null, penalties: false, goal_limit: null, draw_rule: 'draw' }))
  })

  it("starts from the last session's format", async () => {
    resetDb({ sessions: [{ ...session, ...PRESETS.knockout, created_at: '2026-10-01T00:00:00Z' }] })
    renderDialog()
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Knockout' })).toBeChecked())
  })
})
