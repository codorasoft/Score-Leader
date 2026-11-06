import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { InLeague, testLeague } from '../../test/league'
import { LeagueProvider } from '../../contexts/LeagueContext'

interface Row { id: string; date: string; status: string; share_token: string }
interface Result { data: Row[] | null; error: { message: string } | null }
const h = vi.hoisted(() => ({
  eqs: [] as unknown[][],
  request: vi.fn<(leagueId: string, status: string) => Promise<Result>>(),
}))
const rows: Row[] = [
  { id: 'a', date: '2026-10-01', status: 'active', share_token: 'tok-a' },
  { id: 'b', date: '2026-09-20', status: 'completed', share_token: 'tok-b' },
  { id: 'c', date: '2026-09-10', status: 'completed', share_token: 'tok-c' },
]
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      let status = '', leagueId = ''
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (...a: unknown[]) => {
        h.eqs.push(a)
        if (a[0] === 'status') status = a[1] as string
        if (a[0] === 'league_id') leagueId = a[1] as string
        return q
      }
      q.order = () => q
      q.limit = () => h.request(leagueId, status)
      return q
    },
  },
}))

import LeagueHomePage from './LeagueHomePage'

beforeEach(() => {
  h.eqs.length = 0
  h.request.mockReset().mockImplementation(async (_leagueId, status) => ({ data: rows.filter((r) => r.status === status), error: null }))
})

const renderPage = () => render(<MemoryRouter><InLeague features={[]}><LeagueHomePage /></InLeague></MemoryRouter>)

it('shows the active session and completed history with share links, no features needed', async () => {
  renderPage()
  await waitFor(() => expect(document.querySelector('a[href="/s/tok-a"]')).not.toBeNull())
  expect(document.querySelector('a[href="/s/tok-b"]')).not.toBeNull()
  expect(document.querySelector('a[href="/s/tok-c"]')).not.toBeNull()
  expect(screen.getByRole('heading', { name: 'Eagles' })).toBeInTheDocument()
  expect(h.eqs).toContainEqual(['league_id', 'L1'])
})

it.each(['active', 'completed'])('offers a retry when the %s sessions query fails', async (failedStatus) => {
  let failed = true
  h.request.mockImplementation(async (_leagueId, status) => failed && status === failedStatus
    ? { data: null, error: { message: 'Failed to fetch' } }
    : { data: rows.filter((r) => r.status === status), error: null })
  const user = userEvent.setup()
  renderPage()

  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(screen.queryByText('No bookings yet.')).not.toBeInTheDocument()
  expect(document.querySelector('a[href^="/s/"]')).toBeNull()

  failed = false
  await user.click(retry)
  await waitFor(() => expect(document.querySelector('a[href="/s/tok-a"]')).not.toBeNull())
  expect(document.querySelector('a[href="/s/tok-b"]')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
})

it('recovers from a rejected request without getting stuck on loading', async () => {
  h.request.mockRejectedValueOnce(new Error('Connection interrupted'))
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(document.querySelector('a[href="/s/tok-a"]')).not.toBeNull())
  expect(document.querySelector('a[href="/s/tok-b"]')).not.toBeNull()
})

it('keeps an empty successful history distinct from a loading failure', async () => {
  h.request.mockResolvedValue({ data: [], error: null })
  renderPage()
  expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
})

it.each(['success', 'failure'])('ignores a late %s from the previous league', async (outcome) => {
  let resolveOld!: (value: Result) => void
  const old = new Promise<Result>((resolve) => { resolveOld = resolve })
  h.request.mockImplementation((leagueId, status) => leagueId === 'L1' ? old : Promise.resolve({
    data: status === 'active' ? [{ ...rows[0], share_token: 'tok-new' }] : [], error: null,
  }))
  const view = (id: string) => (
    <MemoryRouter><LeagueProvider league={{ ...testLeague([]), id }}><LeagueHomePage /></LeagueProvider></MemoryRouter>
  )
  const { rerender } = render(view('L1'))
  rerender(view('L2'))
  await waitFor(() => expect(document.querySelector('a[href="/s/tok-new"]')).not.toBeNull())

  await act(async () => {
    resolveOld(outcome === 'failure' ? { data: null, error: { message: 'Failed to fetch' } } : { data: rows, error: null })
    await old
  })
  expect(document.querySelector('a[href="/s/tok-new"]')).not.toBeNull()
  expect(document.querySelector('a[href="/s/tok-a"]')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
})
