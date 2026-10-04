import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { buildPlayerHistory } from '../../utils/playerHistory'
import { PlayerFormChart } from '../../components/PlayerFormChart'
import type { AwardType, Match, MatchEvent, Player, Session, SessionAward, Team } from '../../lib/types'

const colorDot: Record<string, string> = { green: 'bg-green-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400' }

const AWARD_META: Record<AwardType, { icon: string; key: string }> = {
  mvp: { icon: '⭐', key: 'awards.mvp' },
  best_goalscorer: { icon: '⚽', key: 'awards.bestScorer' },
  best_assister: { icon: '🎯', key: 'awards.bestAssister' },
  best_goalkeeper: { icon: '🧤', key: 'awards.bestGk' },
  fair_play: { icon: '🤝', key: 'awards.fairPlay' },
}

interface ProfileData {
  player: Player
  sessions: Session[]
  teams: Team[]
  matches: Match[]
  events: MatchEvent[]
  awards: SessionAward[]
}

export default function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const { t } = useTranslation()
  const [data, setData] = useState<ProfileData | null | 'missing'>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: player }, { data: tpRows }, { data: events }, { data: awards }] = await Promise.all([
        supabase.from('players').select('*').eq('id', playerId).maybeSingle(),
        supabase.from('team_players').select('team_id').eq('player_id', playerId),
        supabase.from('match_events').select('*').eq('player_id', playerId),
        supabase.from('session_awards').select('*').eq('winner_player_id', playerId),
      ])
      if (!player) { setData('missing'); return }

      const teamIds = (tpRows ?? []).map((r: { team_id: string }) => r.team_id)
      const { data: teams } = teamIds.length
        ? await supabase.from('teams').select('*').in('id', teamIds)
        : { data: [] }
      const sessionIds = [...new Set(((teams ?? []) as Team[]).map((tm) => tm.session_id))]
      const [{ data: sessions }, { data: matches }] = sessionIds.length
        ? await Promise.all([
            supabase.from('sessions').select('*').in('id', sessionIds),
            supabase.from('matches').select('*').in('session_id', sessionIds),
          ])
        : [{ data: [] }, { data: [] }]

      setData({
        player: player as Player,
        sessions: (sessions ?? []) as Session[],
        teams: (teams ?? []) as Team[],
        matches: (matches ?? []) as Match[],
        events: (events ?? []) as MatchEvent[],
        awards: (awards ?? []) as SessionAward[],
      })
    }
    load()
  }, [playerId])

  if (data === null) return <div className="p-4 text-gray-400">{t('common.loading')}</div>
  if (data === 'missing') return <p className="max-w-lg mx-auto p-4 text-gray-400 text-center">{t('profile.notFound')}</p>

  const { player } = data
  const history = buildPlayerHistory({ position: player.position, ...data })
  const { totals, awardCounts } = history
  const winRate = totals.played ? Math.round((totals.wins / totals.played) * 100) : 0

  const tiles = [
    { label: t('profile.sessions'), value: totals.sessions },
    { label: t('profile.matches'), value: totals.played },
    { label: t('profile.winRate'), value: `${winRate}%`, sub: t('profile.record', { w: totals.wins, d: totals.draws, l: totals.losses }) },
    { label: t('profile.goals'), value: totals.goals },
    { label: t('profile.assists'), value: totals.assists },
    player.position === 'GK'
      ? { label: t('profile.cleanSheets'), value: totals.cleanSheets }
      : { label: t('profile.cards'), value: `🟨${totals.yellowCards} 🟥${totals.redCards}` },
  ]

  return (
    <div className="max-w-lg mx-auto">
      <Link to="/leaderboard" className="text-gray-400 hover:text-white text-sm">← {t('profile.back')}</Link>

      <div className="flex items-center gap-4 mt-4 mb-6">
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{player.name}</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{player.position}</span>
        </div>
      </div>

      {totals.sessions === 0 ? (
        <p className="text-gray-500 text-center py-8">{t('profile.noSessions')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold">{tile.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{tile.label}</div>
                {tile.sub && <div className="text-[10px] text-gray-500 mt-0.5">{tile.sub}</div>}
              </div>
            ))}
          </div>

          {Object.keys(awardCounts).length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs uppercase text-gray-400 mb-2">{t('profile.awardsTitle')}</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(awardCounts) as [AwardType, number][]).map(([type, count]) => (
                  <span key={type} className="bg-gray-800 rounded-full px-3 py-1 text-sm">
                    {AWARD_META[type].icon} {t(AWARD_META[type].key)} <span className="text-gray-400">×{count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="bg-gray-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold mb-3">{t('profile.chartTitle')}</h2>
            <PlayerFormChart rows={history.sessions} />
          </section>

          <section>
            <h2 className="text-xs uppercase text-gray-400 mb-2">{t('profile.historyTitle')}</h2>
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="text-start font-normal px-3 py-2">{t('profile.date')}</th>
                    <th className="font-normal px-1 py-2">{t('profile.played')}</th>
                    <th className="font-normal px-1 py-2">{t('profile.wdl')}</th>
                    <th className="font-normal px-1 py-2">{t('profile.g')}</th>
                    <th className="font-normal px-1 py-2">{t('profile.a')}</th>
                    <th className="font-normal px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {[...history.sessions].reverse().map((row) => (
                    <tr key={row.sessionId} className="border-b border-gray-700/50 last:border-0">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className={`w-2.5 h-2.5 rounded-full flex-none ${colorDot[row.teamColor ?? ''] ?? 'bg-gray-500'}`} />
                          {row.date}
                        </span>
                      </td>
                      <td className="text-center px-1">{row.played}</td>
                      <td className="text-center px-1 text-gray-300 whitespace-nowrap">{row.wins}-{row.draws}-{row.losses}</td>
                      <td className="text-center px-1 font-semibold">{row.goals}</td>
                      <td className="text-center px-1">{row.assists}</td>
                      <td className="px-3 text-end whitespace-nowrap">
                        {row.yellowCards > 0 && <span title={t('card.yellow')}>🟨{row.yellowCards > 1 ? row.yellowCards : ''}</span>}
                        {row.redCards > 0 && <span title={t('card.red')}>🟥{row.redCards > 1 ? row.redCards : ''}</span>}
                        {row.awards.map((type) => (
                          <span key={type} title={t(AWARD_META[type].key)}>{AWARD_META[type].icon}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
