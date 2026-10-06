import { render, screen } from '@testing-library/react'
import { LeagueLogo } from './LeagueLogo'

it('shows the uploaded logo', () => {
  const { container } = render(<LeagueLogo league={{ name: 'Eagles', logo_url: 'https://x/y.jpg' }} />)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/y.jpg')
})

it('falls back to the grey shield', () => {
  render(<LeagueLogo league={{ name: 'Eagles', logo_url: null }} />)
  expect(screen.getByRole('img', { name: 'No logo' })).toBeInTheDocument()
})
