import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { LeagueLogo } from '../../components/LeagueLogo'
import { useLeague, usePublicPath } from '../../contexts/LeagueContext'
import type { FeatureKey } from '../../lib/features'
import type { Session } from '../../lib/types'

const PAGES: { rest: string; key: string; feature: FeatureKey }[] = [
  { rest: '/leaderboard', key: 'nav.leaderboard', feature: 'leaderboard' },
  { rest: '/records', key: 'nav.records', feature: 'records' },
  { rest: '/cards', key: 'nav.cards', feature: 'player_cards' },
]

export default function LeagueHomePage() {
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const publicPath = usePublicPath()
  const [loaded, setLoaded] = useState<{ leagueId: string; active: Session | null; history: Session[] } | null>(null)

  useEffect(() => {
    let stale = false
    const load = async () => {
      const [{ data: active }, { data: history }] = await Promise.all([
        supabase.from('sessions').select('*').eq('league_id', league.id).eq('status', 'active')
          .order('date', { ascending: false }).limit(1),
        supabase.from('sessions').select('*').eq('league_id', league.id).eq('status', 'completed')
          .order('date', { ascending: false }).limit(10),
      ])
      if (stale) return
      setLoaded({
        leagueId: league.id,
        active: ((active ?? []) as Session[])[0] ?? null,
        history: (history ?? []) as Session[],
      })
    }
    load()
    return () => { stale = true }
  }, [league.id])

  const data = loaded && loaded.leagueId === league.id ? loaded : null
  const dateLabel = (date: string) =>
    format(new Date(`${date}T00:00:00`), 'PPP', { locale: i18n.language === 'ar' ? ar : enUS })
  const pages = PAGES.filter((p) => league.features.includes(p.feature))

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-3 mb-6">
        <LeagueLogo league={league} size="lg" />
        <h1 className="text-2xl font-bold text-center">{league.name}</h1>
      </div>

      {!data ? (
        <p className="text-gray-400 text-center">{t('common.loading')}</p>
      ) : (
        <>
          {data.active && (
            <Link to={`/s/${data.active.share_token}`}
              className="block mb-6 rounded-xl border border-green-500/60 bg-green-900/20 hover:bg-green-900/30 px-4 py-3">
              <span className="block text-xs uppercase text-green-300">{t('leagueHome.liveNow')}</span>
              <span className="block font-semibold">{dateLabel(data.active.date)}</span>
            </Link>
          )}

          {pages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {pages.map((p) => (
                <Link key={p.rest} to={publicPath(p.rest)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold">
                  {t(p.key)}
                </Link>
              ))}
            </div>
          )}

          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className="text-xs uppercase text-gray-400 mb-2">{t('leagueHome.recentSessions')}</h2>
            {data.history.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('leagueHome.noSessions')}</p>
            ) : (
              <ul className="space-y-2">
                {data.history.map((s) => (
                  <li key={s.id}>
                    <Link to={`/s/${s.share_token}`} className="block bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3">
                      {dateLabel(s.date)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
