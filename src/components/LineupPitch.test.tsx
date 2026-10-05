import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeAll } from 'vitest'
import { LineupPitch, type PitchTeam } from './LineupPitch'
import type { Player } from '../lib/types'

const player = (id: string) => ({ id, name: id, photo_url: null }) as Player
const bottom: PitchTeam = { id: 'G', color: 'green', players: [{ player: player('Ali'), spot: { x: 0.5, y: 0.08 } }] }
const top: PitchTeam = { id: 'B', color: 'blue', players: [{ player: player('Omar'), spot: { x: 0.3, y: 0.5 } }] }

beforeAll(() => {
  // A 200 x 300 pitch at the top-left of the page
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  HTMLElement.prototype.setPointerCapture = () => {}
})

it('places the bottom team in the lower half and mirrors the top team', () => {
  render(<LineupPitch bottom={bottom} top={top} onMove={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Ali' }).style).toMatchObject({ left: '50%', top: '96%' })
  expect(screen.getByRole('button', { name: 'Omar' }).style).toMatchObject({ left: '70%', top: '25%' })
})

it('saves the spot where a dragged player is dropped', () => {
  const onMove = vi.fn()
  render(<LineupPitch bottom={bottom} top={top} onMove={onMove} />)
  const ali = screen.getByRole('button', { name: 'Ali' })
  fireEvent.pointerDown(ali, { pointerId: 1, clientX: 100, clientY: 288 })
  fireEvent.pointerMove(ali, { pointerId: 1, clientX: 60, clientY: 225 })
  fireEvent.pointerUp(ali, { pointerId: 1, clientX: 60, clientY: 225 })
  expect(onMove).toHaveBeenCalledWith('G', 'Ali', { x: 0.3, y: 0.5 })
})

it('keeps a dragged player in their own half', () => {
  const onMove = vi.fn()
  render(<LineupPitch bottom={bottom} top={top} onMove={onMove} />)
  const ali = screen.getByRole('button', { name: 'Ali' })
  fireEvent.pointerDown(ali, { pointerId: 1, clientX: 100, clientY: 288 })
  fireEvent.pointerUp(ali, { pointerId: 1, clientX: 100, clientY: 30 })
  expect(onMove).toHaveBeenCalledWith('G', 'Ali', { x: 0.5, y: 1 })
})
