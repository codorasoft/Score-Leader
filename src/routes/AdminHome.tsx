import { Navigate } from 'react-router-dom'
import { useMyLeagues } from '../contexts/MyLeaguesContext'
import { readLastLeague } from '../lib/leaguePaths'
import type { League } from '../lib/tenancy'

// Last-used league if the admin still owns it, else the first one.
export function pickLeague(leagues: League[]): string | null {
  const last = readLastLeague()
  return leagues.find(l => l.slug === last)?.slug ?? leagues[0]?.slug ?? null
}

export default function AdminHome() {
  const { leagues, profile } = useMyLeagues()
  if (profile.role === 'superadmin') return <Navigate to="/super" replace />
  const slug = pickLeague(leagues)
  return <Navigate to={slug ? `/admin/${slug}/history` : '/admin/leagues/new'} replace />
}
