import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({ deleteLeague: vi.fn() }))
vi.mock('../lib/adminApi', () => ({ deleteLeague: h.deleteLeague }))

import DeleteLeagueDialog from './DeleteLeagueDialog'

const league = { id: 'L1', owner_id: 'u1', name: 'Eagles', slug: 'eagles', logo_url: null, created_at: '2026-01-01' }

beforeEach(() => h.deleteLeague.mockReset())

describe('DeleteLeagueDialog', () => {
  it('enables Delete only when the exact name is typed, then deletes', async () => {
    h.deleteLeague.mockResolvedValue({ ok: true })
    const onDeleted = vi.fn()
    render(<DeleteLeagueDialog league={league} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete league' }))
    const confirm = screen.getByRole('button', { name: 'Delete permanently' })
    const input = screen.getByRole('textbox')
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: 'eagles' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: 'Eagles' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(h.deleteLeague).toHaveBeenCalledWith('L1', 'Eagles'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })
  it('shows the returned error', async () => {
    h.deleteLeague.mockResolvedValue({ error: 'name does not match' })
    render(<DeleteLeagueDialog league={league} onDeleted={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete league' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Eagles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText('The name you typed does not match the league name.')).toBeInTheDocument()
  })
  it('is a named dialog that focuses the name field', () => {
    render(<DeleteLeagueDialog league={league} onDeleted={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete league' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Eagles?' })
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/)
    expect(screen.getByRole('textbox', { name: 'Type "Eagles" to confirm' })).toHaveFocus()
  })
  it('closes on Escape and returns focus to the opening button', async () => {
    const user = userEvent.setup()
    render(<DeleteLeagueDialog league={league} onDeleted={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Delete league' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete league' })).toHaveFocus()
  })
  it('submits with Enter once the name matches', async () => {
    h.deleteLeague.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<DeleteLeagueDialog league={league} onDeleted={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Delete league' }))
    await user.keyboard('Eagle{Enter}')
    expect(h.deleteLeague).not.toHaveBeenCalled()
    await user.keyboard('s{Enter}')
    await waitFor(() => expect(h.deleteLeague).toHaveBeenCalledWith('L1', 'Eagles'))
  })
  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    render(<DeleteLeagueDialog league={league} onDeleted={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Delete league' }))
    await user.keyboard('Eagles')
    const input = screen.getByRole('textbox')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveFocus()
    await user.tab()
    expect(input).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveFocus()
  })
})
