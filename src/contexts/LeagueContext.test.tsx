import { render, screen } from '@testing-library/react'
import { LeagueProvider, Feature, useAdminPath } from './LeagueContext'
import type { LeagueInfo } from '../lib/tenancy'

const league = (features: LeagueInfo['features']): LeagueInfo => ({
  id: '1', slug: 'eagles', name: 'Eagles', logo_url: null, features, is_available: true,
})

describe('Feature', () => {
  it('renders when the league has the feature', () => {
    render(<LeagueProvider league={league(['cards'])}><Feature name="cards"><p>child</p></Feature></LeagueProvider>)
    expect(screen.getByText('child')).toBeInTheDocument()
  })
  it('renders nothing when the league lacks the feature', () => {
    render(<LeagueProvider league={league(['swaps'])}><Feature name="cards"><p>child</p></Feature></LeagueProvider>)
    expect(screen.queryByText('child')).not.toBeInTheDocument()
  })
  it('renders without a provider', () => {
    render(<Feature name="cards"><p>child</p></Feature>)
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})

describe('useAdminPath', () => {
  it('builds the admin path for the current league', () => {
    const C = () => <span>{useAdminPath()('/players')}</span>
    render(<LeagueProvider league={league([])}><C /></LeagueProvider>)
    expect(screen.getByText('/admin/eagles/players')).toBeInTheDocument()
  })
})
