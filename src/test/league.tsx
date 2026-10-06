import type { ReactNode } from 'react'
import { LeagueProvider } from '../contexts/LeagueContext'
import { FEATURES, type FeatureKey } from '../lib/features'

export const testLeague = (features: readonly FeatureKey[] = FEATURES) => ({
  id: 'L1', slug: 'eagles', name: 'Eagles', logo_url: null, features: [...features], is_available: true,
})

export const InLeague = ({ features, children }: { features?: readonly FeatureKey[]; children: ReactNode }) => (
  <LeagueProvider league={testLeague(features)}>{children}</LeagueProvider>
)
