import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { FEATURES } from '../../lib/features'

const h = vi.hoisted(() => ({ createAdmin: vi.fn() }))
vi.mock('../../lib/adminApi', () => ({ createAdmin: h.createAdmin }))

import NewAdminPage from './NewAdminPage'

function setup() {
  const router = createMemoryRouter(
    [{ path: '/super/admins/new', element: <NewAdminPage /> }, { path: '/super/admins/:id', element: <div>detail</div> }],
    { initialEntries: ['/super/admins/new'] },
  )
  render(<RouterProvider router={router} />)
  return router
}
const fill = (password: string) => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' Sam@Example.COM ' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

beforeEach(() => h.createAdmin.mockReset())

describe('NewAdminPage', () => {
  it('rejects a short password without calling createAdmin', async () => {
    setup()
    fill('1234567')
    fireEvent.click(screen.getByRole('button', { name: 'Create admin' }))
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(h.createAdmin).not.toHaveBeenCalled()
  })
  it('submits a valid form with lowercased email and all features', async () => {
    h.createAdmin.mockResolvedValue({ ok: true, user_id: 'u9' })
    const router = setup()
    fill('12345678')
    fireEvent.click(screen.getByRole('button', { name: 'Create admin' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/super/admins/u9'))
    expect(h.createAdmin).toHaveBeenCalledWith({
      email: 'sam@example.com', password: '12345678', display_name: 'Sam', max_leagues: 1, features: [...FEATURES],
    })
  })
  it('shows the error returned by the server', async () => {
    h.createAdmin.mockResolvedValue({ error: 'email already registered' })
    setup()
    fill('12345678')
    fireEvent.click(screen.getByRole('button', { name: 'Create admin' }))
    expect(await screen.findByText('email already registered')).toBeInTheDocument()
  })
})
