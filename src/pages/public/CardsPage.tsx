import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadLeague } from '../../lib/league'
import { useLeague, useFeature, usePublicPath } from '../../contexts/LeagueContext'
import { cardsForLeague } from '../../utils/leagueCards'
import { PlayerCardView } from '../../components/PlayerCardView'
import type { Player } from '../../lib/types'
import type { PlayerCard } from '../../utils/playerCard'

export default function CardsPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const publicPath = usePublicPath()
  const profiles = useFeature('profiles')
  const [loaded, setLoaded] = useState<{ leagueId: string; rows: { player: Player; card: PlayerCard }[] } | null>(null)

  useEffect(() => {
    let stale = false
    loadLeague(league.id).then((data) => {
      if (stale) return
      const cards = cardsForLeague(data)
      const rows = data.players
        .filter((p) => p.is_active)
        .map((player) => ({ player, card: cards.get(player.id)!.card }))
        // Players with real matches first; star-only estimates (NEW) after them
        .sort((a, b) => Number(a.card.isNew) - Number(b.card.isNew) || b.card.overall - a.card.overall || a.player.name.localeCompare(b.player.name))
      setLoaded({ leagueId: league.id, rows })
    })
    return () => { stale = true }
  }, [league.id])

  const rows = loaded?.leagueId === league.id ? loaded.rows : null

  if (!rows) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🃏 {t('cards.title')}</h1>
      <p className="text-sm text-gray-400 mb-4">{t('cards.subtitle')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 justify-items-center">
        {rows.map(({ player, card }) => (
          profiles ? (
            <Link key={player.id} to={publicPath(`/players/${player.id}`)} className="transition-transform hover:-translate-y-1">
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
