import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadLeague } from '../../lib/league'
import { useLeague, useFeature, usePublicPath } from '../../contexts/LeagueContext'
import { computeRecords, type LeagueRecord, type RecordHolder } from '../../utils/records'
import { formatMatchClock } from '../../utils/matchClock'
import { styleMap } from '../../lib/teamColors'

const MAX_HOLDERS = 3

const dot = styleMap('dot')

export default function RecordsPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const publicPath = usePublicPath()
  const profiles = useFeature('profiles')
  const [loaded, setLoaded] = useState<{ leagueId: string; records: LeagueRecord[] } | null>(null)

  useEffect(() => {
    let stale = false
    loadLeague(league.id).then((data) => { if (!stale) setLoaded({ leagueId: league.id, records: computeRecords(data) }) })
    return () => { stale = true }
  }, [league.id])

  const records = loaded?.leagueId === league.id ? loaded.records : null

  if (!records) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const valueLabel = (r: LeagueRecord) => {
    switch (r.id) {
      case 'biggest_win': return t('records.margin', { count: r.value })
      case 'fastest_goal': return formatMatchClock(r.value)
      case 'best_duo': return `${r.value}%`
      case 'win_streak':
      case 'unbeaten_streak': return t('records.matches', { count: r.value })
      case 'most_sessions': return t('leaderboard.sessions', { count: r.value })
      case 'session_clean_sheets': return t('leaderboard.cs', { count: r.value })
      case 'session_assists': return `${r.value} ${t('awards.assistsUnit', { count: r.value })}`
      case 'session_contributions': return t('records.contributions', { count: r.value })
      default: return `${r.value} ${t('awards.goalsUnit', { count: r.value })}`
    }
  }

  const holder = (h: RecordHolder, i: number) => {
    if (h.kind === 'player') {
      return (
        <li key={i} className="flex items-center justify-between gap-2 text-sm">
          {profiles
            ? <Link to={publicPath(`/players/${h.playerId}`)} className="font-semibold hover:underline truncate">{h.name}</Link>
            : <span className="font-semibold truncate">{h.name}</span>}
          {h.date && <span className="text-xs text-gray-400 shrink-0" dir="ltr">{h.date}</span>}
        </li>
      )
    }
    if (h.kind === 'match') {
      const team = (c: string) => t('common.teamName', { color: t(`common.teamColor.${c}`) })
      return (
        <li key={i} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot[h.winnerColor]}`} />
            <span className="truncate">{team(h.winnerColor)}</span>
            <span className="font-mono shrink-0" dir="ltr">{h.winnerScore}–{h.loserScore}</span>
            <span className="truncate">{team(h.loserColor)}</span>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot[h.loserColor]}`} />
          </span>
          <span className="text-xs text-gray-400 shrink-0" dir="ltr">{h.date}</span>
        </li>
      )
    }
    return (
      <li key={i} className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold truncate">{h.names.join(' & ')}</span>
        <span className="text-xs text-gray-400 shrink-0">{t('records.duoRecord', { wins: h.wins, matches: h.matches })}</span>
      </li>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">🏆 {t('records.title')}</h1>
      <p className="text-sm text-gray-400 mb-4">{t('records.subtitle')}</p>
      {records.length === 0 && <p className="text-gray-500 text-center py-8">{t('records.none')}</p>}
      <div className="space-y-3">
        {records.map((r) => (
          <section key={r.id} className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl" aria-hidden="true">{r.icon}</span>
              <h2 className="flex-1 font-semibold">{t(`records.${r.id}`)}</h2>
              <span className="text-lg font-black text-yellow-300 shrink-0">{valueLabel(r)}</span>
            </div>
            <ul className="space-y-1 ps-10">
              {r.holders.slice(0, MAX_HOLDERS).map(holder)}
              {r.holders.length > MAX_HOLDERS && (
                <li className="text-xs text-gray-400">{t('records.more', { count: r.holders.length - MAX_HOLDERS })}</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
