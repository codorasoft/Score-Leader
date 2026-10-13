import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { inArabic } from '../test/arabic'
import FormationDialog from './FormationDialog'

const open = (onPitch = 7, current: string | null = null) => {
  const onApply = vi.fn(), onClose = vi.fn()
  render(<FormationDialog onPitch={onPitch} current={current} onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}
const button = (name: string) => screen.getByRole('button', { name })

it('offers only the formations for the number on the pitch', () => {
  open(7)
  expect(screen.getByRole('dialog', { name: 'Formation' })).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByText('7 players: the goalkeeper and 6 more.')).toBeInTheDocument()
  for (const name of ['2-3-1', '3-2-1', '3-1-2', '2-2-2']) expect(button(name)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '4-4-2' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '2-2' })).not.toBeInTheDocument()
})

it('applies the suggestion that was tapped', () => {
  const { onApply } = open(7)
  fireEvent.click(button('3-2-1'))
  expect(button('3-2-1')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(button('Apply'))
  expect(onApply).toHaveBeenCalledWith('3-2-1')
})

it('opens on the board’s formation, or on the first suggestion when it does not fit', () => {
  open(7, '3-1-2')
  expect(button('3-1-2')).toHaveAttribute('aria-pressed', 'true')
  expect(button('2-3-1')).toHaveAttribute('aria-pressed', 'false')
  cleanup()
  open(7, '4-4-2')
  expect(button('2-3-1')).toHaveAttribute('aria-pressed', 'true')
})

it('counts the players left while a formation is built, and applies only one that fits', () => {
  const { onApply } = open(7, '2-3-1')
  fireEvent.click(button('One more in line 2'))
  expect(screen.getByRole('status')).toHaveTextContent('2-4-1')
  expect(screen.getByRole('status')).toHaveTextContent('1 player too many')
  expect(button('Apply')).toBeDisabled()
  fireEvent.click(button('One fewer in line 1'))
  expect(screen.getByRole('status')).toHaveTextContent('All players placed')
  fireEvent.click(button('One fewer in line 2'))
  fireEvent.click(button('One fewer in line 2'))
  expect(screen.getByRole('status')).toHaveTextContent('2 players left to place')
  expect(button('Apply')).toBeDisabled()
  fireEvent.click(button('One more in line 3'))
  fireEvent.click(button('One more in line 3'))
  fireEvent.click(button('Apply'))
  expect(onApply).toHaveBeenCalledWith('1-2-3')
})

it('adds and removes lines, within one to five lines of one to six', () => {
  open(11, '4-4-2')
  expect(button('One fewer in line 3')).toBeEnabled()
  fireEvent.click(button('Add a line'))
  fireEvent.click(button('Add a line'))
  expect(screen.getByRole('status')).toHaveTextContent('4-4-2-1-1')
  expect(button('Add a line')).toBeDisabled()
  expect(button('One fewer in line 5')).toBeDisabled()
  fireEvent.click(button('Remove line 4'))
  expect(screen.getByRole('status')).toHaveTextContent('4-4-2-1')
  for (let i = 0; i < 2; i++) fireEvent.click(button('One more in line 1'))
  expect(button('One more in line 1')).toBeDisabled()
})

it('keeps at least one line', () => {
  open(2, '1')
  expect(button('Remove line 1')).toBeDisabled()
})

it('draws a dot for every spot of the formation being built', () => {
  open(5, '2-2')
  expect(screen.getByRole('status').parentElement!.querySelectorAll('circle[data-spot]')).toHaveLength(5)
})

it('closes on Cancel, Escape and a tap outside, applying nothing', () => {
  const { onApply, onClose } = open()
  fireEvent.click(button('Cancel'))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('dialog').parentElement!)
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(onApply).not.toHaveBeenCalled()
})

it('is in Arabic when the app is', async () => {
  await inArabic(() => {
    open(7)
    expect(screen.getByRole('dialog', { name: 'التشكيلة' })).toBeInTheDocument()
    expect(button('تطبيق')).toBeInTheDocument()
  })
})
