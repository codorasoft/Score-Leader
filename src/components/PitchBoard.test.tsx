import { render, screen, fireEvent, act } from '@testing-library/react'
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

describe('drawing', () => {
  it('draws a pass arrow by dragging on the pitch while the pass tool is on', () => {
    const onAddShape = vi.fn()
    render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }]} onMove={vi.fn()} tool="pass" color="yellow" drawings={[]} onAddShape={onAddShape} onEraseShape={vi.fn()} />)
    const area = screen.getByLabelText('Drawing area')
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 50, clientY: 270 })
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 120, clientY: 150 })
    fireEvent.pointerUp(area, { pointerId: 1, clientX: 120, clientY: 150 })
    expect(onAddShape).toHaveBeenCalledWith(expect.objectContaining({ kind: 'arrow', dashed: false, color: 'yellow', x1: 0.25, y1: 0.9, x2: 0.6, y2: 0.5 }))
  })

  it('does not move players while a drawing tool is on', () => {
    render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }]} onMove={vi.fn()} tool="zone" color="red" drawings={[]} onAddShape={vi.fn()} onEraseShape={vi.fn()} />)
    expect(screen.queryByLabelText('Drawing area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ali' })).toHaveClass('pointer-events-none')
  })

  it('removes a drawing when tapped with the eraser', () => {
    const onEraseShape = vi.fn()
    const drawings = [{ id: 'z1', kind: 'zone' as const, color: 'red' as const, cx: 0.5, cy: 0.5, r: 0.1 }]
    render(<PitchBoard players={[]} onMove={vi.fn()} tool="erase" color="red" drawings={drawings} onAddShape={vi.fn()} onEraseShape={onEraseShape} />)
    fireEvent.click(screen.getByLabelText('Remove drawing'))
    expect(onEraseShape).toHaveBeenCalledWith('z1')
  })
})

describe('fast gestures (press, move and release before the screen updates)', () => {
  it('still draws the arrow and starts the next one fresh', () => {
    const onAddShape = vi.fn()
    render(<PitchBoard players={[]} onMove={vi.fn()} tool="pass" color="white" drawings={[]} onAddShape={onAddShape} onEraseShape={vi.fn()} />)
    const area = screen.getByLabelText('Drawing area')
    act(() => {
      fireEvent.pointerDown(area, { pointerId: 1, clientX: 40, clientY: 240 })
      fireEvent.pointerMove(area, { pointerId: 1, clientX: 160, clientY: 60 })
      fireEvent.pointerUp(area, { pointerId: 1, clientX: 160, clientY: 60 })
    })
    act(() => {
      fireEvent.pointerDown(area, { pointerId: 1, clientX: 100, clientY: 270 })
      fireEvent.pointerUp(area, { pointerId: 1, clientX: 100, clientY: 150 })
    })
    expect(onAddShape.mock.calls.map((c) => [c[0].x1, c[0].y1, c[0].x2, c[0].y2])).toEqual([
      [0.2, 0.8, 0.8, 0.2],
      [0.5, 0.9, 0.5, 0.5],
    ])
  })

  it('still moves a player on a quick flick', () => {
    const onMove = vi.fn()
    render(<PitchBoard players={[{ player: ali, x: 0.25, y: 0.9 }]} onMove={onMove} />)
    const token = screen.getByRole('button', { name: 'Ali' })
    act(() => {
      fireEvent.pointerDown(token, { pointerId: 1, clientX: 50, clientY: 270 })
      fireEvent.pointerUp(token, { pointerId: 1, clientX: 150, clientY: 30 })
    })
    expect(onMove).toHaveBeenCalledWith('ali', { x: 0.75, y: 0.1 })
  })
})
