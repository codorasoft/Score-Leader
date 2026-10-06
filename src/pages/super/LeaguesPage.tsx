import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchAdmins, fetchAllLeagues, type League } from '../../lib/tenancy'
import { LeagueLogo } from '../../components/LeagueLogo'

type LeagueRow = League & { session_count: number }

export default function LeaguesPage() {
  const { t, i18n } = useTranslation()
  const [leagues, setLeagues] = useState<LeagueRow[] | null>(null)
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setLeagues(null)
    Promise.all([fetchAdmins(), fetchAllLeagues()])
      .then(([admins, all]) => {
        setOwners(Object.fromEntries(admins.map((a) => [a.user_id, a.email])))
        setLeagues(all)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(load, [load])

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{t('super.leagues.title')}</h1>
      {failed ? (
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      ) : !leagues ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : leagues.length === 0 ? (
        <p className="text-gray-400">{t('super.leagues.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
              <LeagueLogo league={l} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{l.name}</p>
                <p className="text-xs text-gray-400 truncate" dir="ltr">{owners[l.owner_id] ?? '—'}</p>
                <p className="text-xs text-gray-400">
                  {new Date(l.created_at).toLocaleDateString(i18n.language)} · {t('super.sessionCount', { count: l.session_count })}
                </p>
              </div>
              <a href={`/l/${l.slug}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline shrink-0" dir="ltr">/l/{l.slug}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
