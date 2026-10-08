import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchLiveLink } from '../lib/sessionData'
import type { LeagueInfo } from '../lib/tenancy'
import { PublicLeagueShell } from './PublicLeagueRoute'

// One request each: a live link brings its league and its whole session (the page takes the
// session from fetchLiveLink); a vote link brings its league with the vote row.
async function leagueFor(token?: string, voteToken?: string): Promise<LeagueInfo | null> {
  if (!voteToken) return (await fetchLiveLink(token ?? ''))?.league ?? null
  const { data, error } = await supabase.from('award_votes').select('league_id, league_directory(*)').eq('vote_token', voteToken).maybeSingle()
  if (error) throw error
  return (data as { league_directory: LeagueInfo | null } | null)?.league_directory ?? null
}

// /s/:token and /s/vote/:voteToken keep their URLs; the league comes from the row.
export default function SessionLeagueRoute() {
  const { token, voteToken } = useParams()
  const key = voteToken ? `vote:${voteToken}` : `session:${token}`
  const [state, setState] = useState<{ key: string; info: LeagueInfo | null; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    leagueFor(token, voteToken).then(
      info => { if (!cancelled) setState({ key, info }) },
      () => { if (!cancelled) setState({ key, info: null, failed: true }) },
    )
    return () => { cancelled = true }
  }, [key, token, voteToken, attempt])

  const retry = () => {
    setState(null)
    setAttempt(n => n + 1)
  }

  return (
    <PublicLeagueShell
      info={state?.key === key ? state.info : undefined}
      failed={state?.key === key && state.failed}
      onRetry={retry}
    />
  )
}
