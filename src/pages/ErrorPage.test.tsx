import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ErrorPage from './ErrorPage'
import { routes } from '../router'

function Broken(): never {
  throw new Error('boom')
}

describe('ErrorPage', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('shows a translated message and reloads the app from its button', () => {
    const reload = vi.fn()
    const router = createMemoryRouter([{ path: '/', element: <Broken />, errorElement: <ErrorPage reload={reload} /> }])
    render(<RouterProvider router={router} />)

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('catches errors from every route of the app', () => {
    expect(routes).toHaveLength(1)
    expect(routes[0].errorElement).toBeTruthy()
    expect(routes[0].path).toBeUndefined()
  })
})
