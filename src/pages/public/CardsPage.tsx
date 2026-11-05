import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadLeague } from '../../lib/league'
import { useLeague, useFeature, usePublicPath } from '../../contexts/LeagueContext'
import { cardsForLeague } from '../../utils/leagueCards'
import { PlayerCardView } from '../../components/PlayerCardView'
import type { Player } from '../../lib/types'
import type { PlayerCard } from '../../utils/playerCard'
import PageSkeleton from '../../components/PageSkeleton'
import LoadFailed from '../../components/LoadFailed'
import { backTo } from '../../components/BackLink'

export default function CardsPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const publicPath = usePublicPath()
  const profiles = useFeature('profiles')
  const [loaded, setLoaded] = useState<{ leagueId: string; rows: { player: Player; card: PlayerCard }[] | 'failed' } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let stale = false
    loadLeague(league.id).then((data) => {
      if (stale) return
      if (!data.complete) { setLoaded({ leagueId: league.id, rows: 'failed' }); return }
      const cards = cardsForLeague(data)
      const rows = data.players
        .filter((p) => p.is_active)
        .map((player) => ({ player, card: cards.get(player.id)!.card }))
        // Players with real matches first; star-only estimates (NEW) after them
        .sort((a, b) => Number(a.card.isNew) - Number(b.card.isNew) || b.card.overall - a.card.overall || a.player.name.localeCompare(b.player.name))
      setLoaded({ leagueId: league.id, rows })
    }).catch(() => { if (!stale) setLoaded({ leagueId: league.id, rows: 'failed' }) })
    return () => { stale = true }
  }, [league.id, attempt])

  const rows = loaded?.leagueId === league.id ? loaded.rows : null

  if (rows === 'failed') return <LoadFailed onRetry={() => { setLoaded(null); setAttempt((n) => n + 1) }} />
  if (!rows) return <PageSkeleton />

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🃏 {t('cards.title')}</h1>
      <p className="text-sm text-gray-400 mb-4">{t('cards.subtitle')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 justify-items-center">
        {rows.map(({ player, card }) => (
          profiles ? (
            <Link key={player.id} to={publicPath(`/players/${player.id}`)} state={backTo({ to: publicPath('/cards'), labelKey: 'nav.cards' })} className="transition-transform hover:-translate-y-1">
              <PlayerCardView player={player} card={card} size="sm" />
            </Link>
          ) : (
            <div key={player.id}>
              <PlayerCardView player={player} card={card} size="sm" />
            </div>
          )
        ))}
      </div>
    </div>
  )
}
