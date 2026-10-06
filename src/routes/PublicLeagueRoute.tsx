import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LeagueProvider } from '../contexts/LeagueContext'
import { fetchLeagueInfoBySlug, type LeagueInfo } from '../lib/tenancy'
import LoadingScreen from '../components/LoadingScreen'
import NotAvailablePage from '../pages/NotAvailablePage'
import PublicLayout from '../layouts/PublicLayout'

// Shared by the slug and session-token routes; `undefined` means still loading.
export function PublicLeagueShell({ info }: { info: LeagueInfo | null | undefined }) {
  if (info === undefined) return <LoadingScreen />
  if (!info || !info.is_available) return <NotAvailablePage kind="league" />
  return <LeagueProvider league={info}><PublicLayout /></LeagueProvider>
}

export default function PublicLeagueRoute() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<{ slug: string; info: LeagueInfo | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLeagueInfoBySlug(slug).then(info => { if (!cancelled) setState({ slug, info }) })
    return () => { cancelled = true }
  }, [slug])

  return <PublicLeagueShell info={state?.slug === slug ? state.info : undefined} />
}
