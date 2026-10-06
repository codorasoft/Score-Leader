import { createContext, useContext, type ReactNode } from 'react'
import type { LeagueInfo } from '../lib/tenancy'
import type { FeatureKey } from '../lib/features'

const LeagueContext = createContext<LeagueInfo | null>(null)

export function LeagueProvider({ league, children }: { league: LeagueInfo; children: ReactNode }) {
  return <LeagueContext.Provider value={league}>{children}</LeagueContext.Provider>
}

export function useLeague(): LeagueInfo {
  const league = useContext(LeagueContext)
  if (!league) throw new Error('useLeague outside LeagueProvider')
  return league
}

// Outside a provider every feature is on, so shared components work unchanged.
export function useFeature(key: FeatureKey): boolean {
  const league = useContext(LeagueContext)
  return league ? league.features.includes(key) : true
}

export function Feature({ name, children }: { name: FeatureKey; children: ReactNode }) {
  return useFeature(name) ? <>{children}</> : null
}

export function useAdminPath(): (rest?: string) => string {
  const { slug } = useLeague()
  return rest => `/admin/${slug}${rest ?? ''}`
}

export function usePublicPath(): (rest?: string) => string {
  const { slug } = useLeague()
  return rest => `/l/${slug}${rest ?? ''}`
}
