import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchLeagueInfoById, type LeagueInfo } from '../lib/tenancy'
import { PublicLeagueShell } from './PublicLeagueRoute'

async function leagueIdFor(token?: string, voteToken?: string): Promise<string | null> {
  const query = voteToken
    ? supabase.from('award_votes').select('league_id').eq('vote_token', voteToken)
    : supabase.from('sessions').select('league_id').eq('share_token', token ?? '')
  const { data } = await query.maybeSingle()
  return (data as { league_id: string } | null)?.league_id ?? null
}

// /s/:token and /s/vote/:voteToken keep their URLs; the league comes from the row.
export default function SessionLeagueRoute() {
  const { token, voteToken } = useParams()
  const key = voteToken ? `vote:${voteToken}` : `session:${token}`
  const [state, setState] = useState<{ key: string; info: LeagueInfo | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    leagueIdFor(token, voteToken)
      .then(id => (id ? fetchLeagueInfoById(id) : null))
      .then(info => { if (!cancelled) setState({ key, info }) })
    return () => { cancelled = true }
  }, [key, token, voteToken])

  return <PublicLeagueShell info={state?.key === key ? state.info : undefined} />
}
