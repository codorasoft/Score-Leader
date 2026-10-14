import { createContext, useCallback, useContext, type ReactNode } from 'react'
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

// The same function while the league stays the same, so effects can depend on it
export function useAdminPath(): (rest?: string) => string {
  const { slug } = useLeague()
  return useCallback(rest => `/admin/${slug}${rest ?? ''}`, [slug])
}

export function usePublicPath(): (rest?: string) => string {
  const { slug } = useLeague()
  return useCallback(rest => `/l/${slug}${rest ?? ''}`, [slug])
}
