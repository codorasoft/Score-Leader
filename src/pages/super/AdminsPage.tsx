import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchAdmins, fetchAllLeagues, type AdminProfile } from '../../lib/tenancy'

export default function AdminsPage() {
  const { t } = useTranslation()
  const [admins, setAdmins] = useState<AdminProfile[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setAdmins(null)
    Promise.all([fetchAdmins(), fetchAllLeagues()])
      .then(([a, leagues]) => {
        const c: Record<string, number> = {}
        for (const l of leagues) c[l.owner_id] = (c[l.owner_id] ?? 0) + 1
        setCounts(c)
        setAdmins(a)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(load, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">{t('super.admins.title')}</h1>
        <Link to="/super/admins/new" className="px-3 py-2 bg-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-700">
          {t('super.admins.new')}
        </Link>
      </div>

      {failed ? (
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      ) : !admins ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : admins.length === 0 ? (
        <p className="text-gray-400">{t('super.admins.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {admins.map((a) => (
            <li key={a.user_id}>
              <Link to={`/super/admins/${a.user_id}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{a.display_name}</p>
                  <p className="text-xs text-gray-400 truncate" dir="ltr">{a.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('super.admins.leagues', { used: counts[a.user_id] ?? 0, max: a.max_leagues })}
                    {' · '}
                    {t('super.admins.features', { count: a.features.length })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${a.is_disabled ? 'bg-red-900/60 text-red-300' : 'bg-green-900/60 text-green-300'}`}>
                  {a.is_disabled ? t('super.admins.disabled') : t('super.admins.active')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
