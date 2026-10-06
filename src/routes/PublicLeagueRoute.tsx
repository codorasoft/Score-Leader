import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LeagueProvider } from '../contexts/LeagueContext'
import { fetchLeagueInfoBySlug, type LeagueInfo } from '../lib/tenancy'
import LoadFailed from '../components/LoadFailed'
import LoadingScreen from '../components/LoadingScreen'
import NotAvailablePage from '../pages/NotAvailablePage'
import PublicLayout from '../layouts/PublicLayout'

// Shared by the slug and session-token routes; `undefined` means still loading.
// A failed request shows Retry, never "not available".
export function PublicLeagueShell({ info, failed, onRetry }: {
  info: LeagueInfo | null | undefined
  failed?: boolean
  onRetry?: () => void
}) {
  if (failed) return <LoadFailed onRetry={onRetry ?? (() => {})} />
  if (info === undefined) return <LoadingScreen />
  if (!info || !info.is_available) return <NotAvailablePage kind="league" />
  return <LeagueProvider league={info}><PublicLayout /></LeagueProvider>
}

export default function PublicLeagueRoute() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<{ slug: string; info: LeagueInfo | null; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchLeagueInfoBySlug(slug).then(
      info => { if (!cancelled) setState({ slug, info }) },
      () => { if (!cancelled) setState({ slug, info: null, failed: true }) },
    )
    return () => { cancelled = true }
  }, [slug, attempt])

  const retry = () => {
    setState(null)
    setAttempt(n => n + 1)
  }

  return (
    <PublicLeagueShell
      info={state?.slug === slug ? state.info : undefined}
      failed={state?.slug === slug && state.failed}
      onRetry={retry}
    />
  )
}
