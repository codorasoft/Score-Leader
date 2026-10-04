import { useTranslation } from 'react-i18next'
import type { Badge } from '../utils/badges'

interface Props {
  earned: Badge[]
  next: Badge[]
  potmMonths: string[]
}

export function PlayerBadges({ earned, next, potmMonths }: Props) {
  const { t, i18n } = useTranslation()
  const label = (b: Badge) => t(b.labelKey, { count: b.target })
  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })

  return (
    <section className="mb-6" aria-labelledby="badges-title">
      <h2 id="badges-title" className="text-xs uppercase text-gray-400 mb-2">
        {t('badges.title')} <span className="text-gray-500">· {earned.length}</span>
      </h2>

      {earned.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">{t('badges.none')}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {earned.map((b) => (
            <li key={b.id} className="bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-2 min-w-0">
              <span className="text-2xl shrink-0" aria-hidden="true">{b.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{label(b)}</span>
                {b.id === 'potm' && potmMonths.length > 0 && (
                  <span className="block text-[11px] text-yellow-300 truncate">{potmMonths.map(monthName).join(', ')}</span>
                )}
              </span>
              {b.count !== undefined && b.count > 1 && <span className="ms-auto text-xs text-gray-400 shrink-0">×{b.count}</span>}
            </li>
          ))}
        </ul>
      )}

      {next.length > 0 && (
        <div className="bg-gray-800/60 rounded-xl p-3">
          <h3 className="text-xs text-gray-400 mb-2">{t('badges.next')}</h3>
          <ul className="space-y-2">
            {next.map((b) => (
              <li key={b.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="opacity-60" aria-hidden="true">{b.icon}</span>
                  <span className="flex-1 truncate">{label(b)}</span>
                  <span className="text-xs text-gray-400 font-mono" dir="ltr">{Math.min(b.value, b.target)}/{b.target}</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded mt-1" aria-hidden="true">
                  <div className="h-1.5 bg-blue-500 rounded" style={{ width: `${Math.min(100, (b.value / b.target) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
