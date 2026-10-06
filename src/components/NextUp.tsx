import { useTranslation } from 'react-i18next'
import type { Team } from '../lib/types'

// "Next up: Orange Team, then Purple Team": the waiting queue in order. Nothing when nobody waits.
export function NextUp({ queue, teams, className = '' }: { queue: string[]; teams: Team[]; className?: string }) {
  const { t } = useTranslation()
  const names = queue
    .map((id) => teams.find((tm) => tm.id === id))
    .filter((tm): tm is Team => !!tm)
    .map((tm) => t('common.teamName', { color: t(`common.teamColor.${tm.color}`) }))
  if (names.length === 0) return null
  const [first, ...rest] = names
  return (
    <p className={className}>
      {rest.length ? t('match.nextUpThen', { team: first, rest: rest.join(t('common.listSeparator')) }) : t('match.nextUp', { team: first })}
    </p>
  )
}
