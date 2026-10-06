import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { FirstMatchPicker } from './FirstMatchPicker'
import type { TeamColor } from '../lib/types'

function Harness({ colors, onChange }: { colors: TeamColor[]; onChange: (p: [TeamColor, TeamColor] | null) => void }) {
  const [playing, setPlaying] = useState<[TeamColor, TeamColor] | null>(null)
  return <FirstMatchPicker colors={colors} playing={playing} onChange={(p) => { setPlaying(p); onChange(p) }} />
}

const four: TeamColor[] = ['green', 'blue', 'yellow', 'orange']

it('starts on random and offers every team', () => {
  render(<FirstMatchPicker colors={four} playing={null} onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: /Random/ })).toHaveAttribute('aria-pressed', 'true')
  for (const name of ['Green Team', 'Blue Team', 'Yellow Team', 'Orange Team']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
})

it('reports the two teams tapped', () => {
  const onChange = vi.fn()
  render(<Harness colors={four} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Blue Team' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Blue Team' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Orange Team' }))
  expect(onChange).toHaveBeenLastCalledWith(['blue', 'orange'])
  expect(screen.getByRole('button', { name: /Random/ })).toHaveAttribute('aria-pressed', 'false')
})

it('tapping the same team again un-picks it', () => {
  const onChange = vi.fn()
  render(<Harness colors={four} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Blue Team' }))
  fireEvent.click(screen.getByRole('button', { name: 'Blue Team' }))
  expect(screen.getByRole('button', { name: 'Blue Team' })).toHaveAttribute('aria-pressed', 'false')
  expect(onChange).not.toHaveBeenCalled()
})

it('random clears a chosen pair', () => {
  const onChange = vi.fn()
  render(<Harness colors={four} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Green Team' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yellow Team' }))
  fireEvent.click(screen.getByRole('button', { name: /Random/ }))
  expect(onChange).toHaveBeenLastCalledWith(null)
})
