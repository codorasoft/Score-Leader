import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { BenchColumn } from './BenchColumn'

it('shows each substitute as a button under the heading, with the whole name to hand', () => {
  const onPick = vi.fn()
  render(<BenchColumn substitutes={[{ id: 'hadi', name: 'Hadi Abdulrahman Al-Najjar', photo_url: null }, { id: 'g', name: 'Khalil', photo_url: null, guest: true }]} onPick={onPick} />)
  expect(screen.getByText('Subs')).toBeInTheDocument()
  const list = screen.getByRole('list', { name: 'Substitutes' })
  expect(within(list).getAllByRole('button')).toHaveLength(2)
  expect(within(list).getByTitle('Hadi Abdulrahman Al-Najjar')).toHaveAttribute('dir', 'auto')
  fireEvent.click(screen.getByRole('button', { name: 'Substitute: Khalil' }))
  expect(onPick).toHaveBeenCalledWith('g')
})

it('shows a photo when the substitute has one, and the initial otherwise', () => {
  render(<BenchColumn substitutes={[{ id: 'a', name: 'Ali', photo_url: 'https://example.test/ali.jpg' }, { id: 'o', name: 'omar', photo_url: null }]} onPick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Substitute: Ali' }).querySelector('img')).toHaveAttribute('src', 'https://example.test/ali.jpg')
  expect(screen.getByRole('button', { name: 'Substitute: omar' })).toHaveTextContent('O')
})
