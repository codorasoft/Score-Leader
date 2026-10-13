import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { inArabic } from '../test/arabic'
import BenchSwapDialog from './BenchSwapDialog'

const sub = { id: 'hadi', name: 'Hadi', photo_url: null }
const pitch = [
  { id: 'ali', name: 'Ali', photo_url: null, position: 'MID' as const },
  { id: 'g1', name: 'Khalil', photo_url: null, position: null, guest: true },
]
const open = (onPitch = pitch) => {
  const calls = { onSwap: vi.fn(), onPutOn: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
  render(<BenchSwapDialog substitute={sub} onPitch={onPitch} {...calls} />)
  return calls
}

it('lists the players on the pitch and swaps with the one tapped', () => {
  const { onSwap } = open()
  const dialog = screen.getByRole('dialog', { name: 'Swap Hadi' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(within(dialog).getByText('Choose who comes off.')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /Khalil/ })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /Ali/ })).toHaveTextContent('MID')
  fireEvent.click(within(dialog).getByRole('button', { name: /Ali/ }))
  expect(onSwap).toHaveBeenCalledWith('ali')
})

it('can put the substitute on the pitch, or remove them', () => {
  const { onPutOn, onRemove } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Put on the pitch' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(onPutOn).toHaveBeenCalledTimes(1)
  expect(onRemove).toHaveBeenCalledTimes(1)
})

it('says so when nobody is on the pitch', () => {
  open([])
  expect(screen.getByText('Nobody is on the pitch yet.')).toBeInTheDocument()
  expect(screen.queryByText('Choose who comes off.')).not.toBeInTheDocument()
})

it('closes on Cancel, Escape and a tap outside', () => {
  const { onClose, onSwap } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('dialog').parentElement!)
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(onSwap).not.toHaveBeenCalled()
})

it('is in Arabic when the app is', async () => {
  await inArabic(() => {
    open()
    expect(screen.getByRole('dialog', { name: 'تبديل Hadi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'أنزله إلى الملعب' })).toBeInTheDocument()
  })
})
