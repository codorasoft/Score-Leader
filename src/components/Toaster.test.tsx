import { render, screen, act, fireEvent } from '@testing-library/react'
import { Toaster } from './Toaster'
import { showToast } from '../lib/toast'

it('shows a translated message when a toast is emitted and hides it on tap', () => {
  render(<Toaster />)
  act(() => showToast('network'))
  const toast = screen.getByText(/No connection/)
  fireEvent.click(toast)
  expect(screen.queryByText(/No connection/)).not.toBeInTheDocument()
})

it('collapses identical toasts into one', () => {
  render(<Toaster />)
  act(() => { showToast('requestFailed', 'boom'); showToast('requestFailed', 'boom') })
  expect(screen.getAllByText(/boom/)).toHaveLength(1)
})
