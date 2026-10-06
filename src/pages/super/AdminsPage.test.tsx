import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({ fetchAdmins: vi.fn(), fetchAllLeagues: vi.fn() }))
vi.mock('../../lib/tenancy', () => ({ fetchAdmins: h.fetchAdmins, fetchAllLeagues: h.fetchAllLeagues }))

import AdminsPage from './AdminsPage'

const renderPage = () => render(<MemoryRouter><AdminsPage /></MemoryRouter>)

beforeEach(() => { h.fetchAdmins.mockReset(); h.fetchAllLeagues.mockReset() })

describe('AdminsPage', () => {
  it('shows the retry UI, not the empty state, when fetchAdmins rejects', async () => {
    h.fetchAdmins.mockRejectedValue(new Error('offline'))
    h.fetchAllLeagues.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Could not load. Check your connection.')).toBeInTheDocument()
    expect(screen.queryByText('No admins yet')).not.toBeInTheDocument()
    h.fetchAdmins.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No admins yet')).toBeInTheDocument()
  })
  it('shows the retry UI when fetchAllLeagues rejects', async () => {
    h.fetchAdmins.mockResolvedValue([])
    h.fetchAllLeagues.mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
