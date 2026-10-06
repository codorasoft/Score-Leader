import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { LeagueProvider } from '../../contexts/LeagueContext'
import { FEATURES } from '../../lib/features'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('../../contexts/MyLeaguesContext', () => ({ useMyLeagues: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }) }))

import LeagueSettingsPage from './LeagueSettingsPage'

const league = (id: string, slug: string, name: string) => ({ id, slug, name, logo_url: null, features: [...FEATURES], is_available: true })

it('shows the new league name after switching league on the settings page', () => {
  const { rerender } = render(
    <LeagueProvider league={league('L1', 'eagles', 'Eagles')}><LeagueSettingsPage /></LeagueProvider>,
  )
  expect(screen.getByRole('textbox')).toHaveValue('Eagles')

  rerender(<LeagueProvider league={league('L2', 'tigers', 'Tigers')}><LeagueSettingsPage /></LeagueProvider>)

  expect(screen.getByRole('textbox')).toHaveValue('Tigers')
  expect(screen.getByText('tigers')).toBeInTheDocument()
})
