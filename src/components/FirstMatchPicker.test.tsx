import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { FirstMatchPicker } from './FirstMatchPicker'

it('offers a coin flip plus every pairing with the team that waits', () => {
  render(<FirstMatchPicker waiting={null} onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: /Random/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /Blue Team vs Yellow Team.*Green Team waits/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Green Team vs Yellow Team.*Blue Team waits/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Green Team vs Blue Team.*Yellow Team waits/ })).toBeInTheDocument()
})

it('reports the chosen waiting team', () => {
  const onChange = vi.fn()
  render(<FirstMatchPicker waiting={null} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /Yellow Team waits/ }))
  expect(onChange).toHaveBeenCalledWith('yellow')
})
