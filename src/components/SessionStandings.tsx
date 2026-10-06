import { useTranslation } from 'react-i18next'
import type { Match, Team } from '../lib/types'
import { computeStandings } from '../utils/standings'
import { styleMap } from '../lib/teamColors'

const colorDot = styleMap('dot')
const MEDALS = ['🥇', '🥈', '🥉']

export function SessionStandings({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  const { t } = useTranslation()
  const rows = computeStandings(teams, matches)
  if (rows.every((r) => r.played === 0)) return null

  return (
    <section aria-labelledby="standings-title">
      <h3 id="standings-title" className="text-xs uppercase text-gray-400 mb-2">{t('standings.title')}</h3>
      <ol className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.team.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 ${r.rank === 1 ? 'bg-gray-800 border border-yellow-500/50' : 'bg-gray-800/60'}`}
          >
            <span className="text-2xl w-8 text-center shrink-0" aria-label={t('standings.rank', { rank: r.rank })}>
              {MEDALS[r.rank - 1] ?? r.rank}
            </span>
            <span className={`w-3 h-3 rounded-full shrink-0 ${colorDot[r.team.color] ?? 'bg-gray-500'}`} />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">
                {t('common.teamName', { color: t(`common.teamColor.${r.team.color}`) })}
              </span>
              <span className="block text-xs text-gray-400">
                {t('standings.record', { w: r.wins, d: r.draws, l: r.losses })}
                {' · '}
                {t('standings.goals', { for: r.goalsFor, against: r.goalsAgainst })}
              </span>
            </span>
            <span className="text-end shrink-0">
              <span className="block text-2xl font-bold leading-none">{r.wins}</span>
              <span className="block text-[11px] text-gray-400 mt-1">{t('standings.wins', { count: r.wins })}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
