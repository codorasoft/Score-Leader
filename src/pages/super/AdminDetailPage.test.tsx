import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const h = vi.hoisted(() => ({
  fetchAdmins: vi.fn(), fetchAllLeagues: vi.fn(), updateAdmin: vi.fn(), showToast: vi.fn(),
}))
vi.mock('../../lib/tenancy', () => ({
  fetchAdmins: h.fetchAdmins, fetchAllLeagues: h.fetchAllLeagues, updateAdmin: h.updateAdmin,
}))
vi.mock('../../lib/adminApi', () => ({ resetAdminPassword: vi.fn(), deleteLeague: vi.fn() }))
vi.mock('../../lib/toast', () => ({ showToast: h.showToast }))

import AdminDetailPage from './AdminDetailPage'

const admin = {
  user_id: 'u1', role: 'admin', email: 'a@x.com', display_name: 'Sam', max_leagues: 1,
  features: ['leaderboard'], is_disabled: false, created_at: '2026-01-01',
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset())
  h.fetchAdmins.mockResolvedValue([admin])
  h.fetchAllLeagues.mockResolvedValue([
    { id: 'L1', owner_id: 'u1', name: 'Eagles', slug: 'eagles', logo_url: null, created_at: '2026-01-01', session_count: 4 },
    { id: 'L2', owner_id: 'u2', name: 'Other', slug: 'other', logo_url: null, created_at: '2026-01-01', session_count: 0 },
  ])
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/super/admins/u1']}>
    <Routes><Route path="/super/admins/:userId" element={<AdminDetailPage />} /></Routes>
  </MemoryRouter>,
)

describe('AdminDetailPage', () => {
  it('saves changed max leagues', async () => {
    h.updateAdmin.mockResolvedValue(true)
    renderPage()
    const input = await screen.findByLabelText('Max leagues')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.updateAdmin).toHaveBeenCalledWith('u1', expect.objectContaining({ max_leagues: 3 })))
    await waitFor(() => expect(h.showToast).toHaveBeenCalled())
  })
  it('lists only this admin\'s leagues', async () => {
    renderPage()
    expect(await screen.findByText('Eagles')).toBeInTheDocument()
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
  })
  it('shows retry when loading fails', async () => {
    h.fetchAdmins.mockRejectedValue(new Error('x'))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
