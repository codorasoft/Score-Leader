import { useEffect, useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useMyLeagues } from '../contexts/MyLeaguesContext'
import { LeagueProvider } from '../contexts/LeagueContext'
import { writeLastLeague } from '../lib/leaguePaths'
import type { LeagueInfo } from '../lib/tenancy'
import AdminLayout from '../layouts/AdminLayout'

export default function AdminLeagueRoute() {
  const { slug } = useParams()
  const { leagues, profile } = useMyLeagues()
  const league = leagues.find(l => l.slug === slug)

  const info = useMemo<LeagueInfo | null>(() => league ? {
    id: league.id, slug: league.slug, name: league.name, logo_url: league.logo_url,
    features: profile.features, is_available: true,
  } : null, [league, profile.features])

  useEffect(() => {
    if (league) writeLastLeague(league.slug)
  }, [league])

  if (!info) return <Navigate to="/admin" replace />
  return <LeagueProvider league={info}><AdminLayout /></LeagueProvider>
}
