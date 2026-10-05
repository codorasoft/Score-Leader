import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeAll } from 'vitest'
import { PitchBoard } from './PitchBoard'
import type { Player } from '../lib/types'

const ali = { id: 'ali', name: 'Ali', photo_url: null } as Player
const omar = { id: 'omar', name: 'Omar', photo_url: null } as Player

beforeAll(() => {
  // A 200 x 300 pitch at the top-left of the page
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = () => {}
})

it('shows each player at their spot', () => {
  render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }, { player: omar, x: 0.5, y: 0.1 }]} onMove={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Ali' }).style).toMatchObject({ left: '25%', top: '90%' })
  expect(screen.getByRole('button', { name: 'Omar' }).style).toMatchObject({ left: '50%', top: '10%' })
})

it('lets a player be dragged anywhere on the pitch, including the other half', () => {
  const onMove = vi.fn()
  render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }]} onMove={onMove} />)
  const token = screen.getByRole('button', { name: 'Ali' })
  fireEvent.pointerDown(token, { pointerId: 1, clientX: 50, clientY: 270 })
  fireEvent.pointerMove(token, { pointerId: 1, clientX: 150, clientY: 30 })
  fireEvent.pointerUp(token, { pointerId: 1, clientX: 150, clientY: 30 })
  expect(onMove).toHaveBeenCalledWith('ali', { x: 0.75, y: 0.1 })
})

it('keeps a player on the pitch when dropped outside it', () => {
  const onMove = vi.fn()
  render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }]} onMove={onMove} />)
  const token = screen.getByRole('button', { name: 'Ali' })
  fireEvent.pointerDown(token, { pointerId: 1, clientX: 50, clientY: 270 })
  fireEvent.pointerUp(token, { pointerId: 1, clientX: 260, clientY: -40 })
  expect(onMove).toHaveBeenCalledWith('ali', { x: 1, y: 0 })
})
