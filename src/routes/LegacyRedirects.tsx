import { Navigate, useLocation } from 'react-router-dom'
import { useMyLeagues } from '../contexts/MyLeaguesContext'
import { LEGACY_SLUG } from '../lib/leaguePaths'
import { pickLeague } from './AdminHome'

// /leaderboard, /records, /cards, /players/:id → same page in the legacy league.
export function LegacyPublicRedirect() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={`/l/${LEGACY_SLUG}${pathname}${search}${hash}`} replace />
}

// /admin/<page> → /admin/<last-used league>/<page>.
export function LegacyAdminRedirect() {
  const { pathname, search, hash } = useLocation()
  const slug = pickLeague(useMyLeagues().leagues)
  if (!slug) return <Navigate to="/admin" replace />
  const rest = pathname.replace(/^\/admin\/?/, '')
  return <Navigate to={`/admin/${slug}/${rest}${search}${hash}`} replace />
}
