import { useTranslation } from 'react-i18next'
import type { LeagueInfo } from '../lib/tenancy'

const SIZES = { sm: 'w-7 h-7', md: 'w-10 h-10', lg: 'w-24 h-24' } as const

// League logo, or a grey shield when the league has none.
export function LeagueLogo({ league, size = 'md' }: { league: Pick<LeagueInfo, 'name' | 'logo_url'>; size?: keyof typeof SIZES }) {
  const { t } = useTranslation()
  const box = `${SIZES[size]} rounded-full shrink-0 bg-gray-700`
  return league.logo_url ? (
    <img src={league.logo_url} alt="" loading="lazy" className={`${box} object-cover`} />
  ) : (
    <svg role="img" aria-label={t('league.noLogo')} viewBox="0 0 24 24" className={`${box} p-1.5 text-gray-400`}>
      <path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" />
    </svg>
  )
}
