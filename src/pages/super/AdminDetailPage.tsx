import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchAdmins, fetchAllLeagues, updateAdmin, type AdminProfile, type League } from '../../lib/tenancy'
import { resetAdminPassword } from '../../lib/adminApi'
import { showToast } from '../../lib/toast'
import { serverErrorKey } from '../../lib/errorText'
import type { FeatureKey } from '../../lib/features'
import FeatureChecklist from '../../components/FeatureChecklist'
import { LeagueLogo } from '../../components/LeagueLogo'
import DeleteLeagueDialog from '../../components/DeleteLeagueDialog'

type LeagueRow = League & { session_count: number }

export default function AdminDetailPage() {
  const { t } = useTranslation()
  const { userId } = useParams()
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [missing, setMissing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  const [maxLeagues, setMaxLeagues] = useState('1')
  const [features, setFeatures] = useState<FeatureKey[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')

  const load = useCallback(() => {
    setFailed(false)
    setMissing(false)
    setAdmin(null)
    Promise.all([fetchAdmins(), fetchAllLeagues()])
      .then(([admins, all]) => {
        const found = admins.find((a) => a.user_id === userId)
        if (!found) { setMissing(true); return }
        setAdmin(found)
        setName(found.display_name)
        setMaxLeagues(String(found.max_leagues))
        setFeatures(found.features)
        setLeagues(all.filter((l) => l.owner_id === found.user_id))
      })
      .catch(() => setFailed(true))
  }, [userId])

  useEffect(load, [load])

  async function save() {
    if (!admin || busy) return
    const max = maxLeagues.trim() === '' ? NaN : Number(maxLeagues)
    const trimmed = name.trim()
    if (!Number.isInteger(max) || max < 0 || max > 100) { setError(t('super.errors.maxLeagues')); return }
    if (trimmed.length < 1 || trimmed.length > 80) { setError(t('super.errors.name')); return }
    setError('')
    setBusy(true)
    const ok = await updateAdmin(admin.user_id, { display_name: trimmed, max_leagues: max, features })
    setBusy(false)
    if (!ok) { showToast('requestFailed', t('super.errors.generic')); return }
    setAdmin({ ...admin, display_name: trimmed, max_leagues: max, features })
    showToast('success', t('super.detail.saved'))
  }

  async function toggleDisabled() {
    if (!admin || busy) return
    setBusy(true)
    const ok = await updateAdmin(admin.user_id, { is_disabled: !admin.is_disabled })
    setBusy(false)
    if (!ok) { showToast('requestFailed', t('super.errors.generic')); return }
    setAdmin({ ...admin, is_disabled: !admin.is_disabled })
    showToast('success', t('super.detail.saved'))
  }

  async function resetPassword() {
    if (!admin || busy) return
    if (password.length < 8) { setPwError(t('super.errors.password')); return }
    setPwError('')
    setBusy(true)
    const res = await resetAdminPassword(admin.user_id, password)
    setBusy(false)
    if ('error' in res) { setPwError(t(serverErrorKey(res.error))); return }
    setPassword('')
    showToast('success', t('super.detail.passwordReset'))
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white'
  const back = <Link to="/super" className="text-sm text-gray-400 hover:text-white">{t('super.newAdmin.back')}</Link>

  if (failed) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (missing) return <div className="space-y-3"><p className="text-gray-400">{t('super.detail.notFound')}</p>{back}</div>
  if (!admin) return <p className="text-gray-400">{t('common.loading')}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{admin.display_name}</h1>
          <p className="text-xs text-gray-400 truncate" dir="ltr">{admin.email}</p>
        </div>
        {back}
      </div>

      <section className="space-y-4">
        <label className="block">
          <span className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.name')}</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="block">
          <span className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.maxLeagues')}</span>
          <input className={input} type="number" min={0} max={100} value={maxLeagues} onChange={(e) => setMaxLeagues(e.target.value)} />
        </label>
        <div>
          <p className="text-sm text-gray-300 mb-1">{t('super.newAdmin.features')}</p>
          <FeatureChecklist value={features} onChange={setFeatures} />
        </div>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button onClick={save} disabled={busy} className="w-full py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
          {t('common.save')}
        </button>
      </section>

      <section className="flex items-center justify-between">
        <span className={`text-xs px-2 py-1 rounded-full ${admin.is_disabled ? 'bg-red-900/60 text-red-300' : 'bg-green-900/60 text-green-300'}`}>
          {admin.is_disabled ? t('super.admins.disabled') : t('super.admins.active')}
        </span>
        <button onClick={toggleDisabled} disabled={busy} className="px-3 py-2 rounded-lg bg-gray-800 text-sm hover:bg-gray-700 disabled:opacity-50">
          {admin.is_disabled ? t('super.detail.enable') : t('super.detail.disable')}
        </button>
      </section>

      <section className="space-y-2">
        <label htmlFor="reset-password" className="block text-sm text-gray-300">{t('super.detail.newPassword')}</label>
        <div className="flex gap-2">
          <input id="reset-password" className={input} dir="ltr" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={resetPassword} disabled={busy} className="px-3 rounded-lg bg-gray-800 text-sm shrink-0 hover:bg-gray-700 disabled:opacity-50">
            {t('super.detail.resetPassword')}
          </button>
        </div>
        {pwError && <p role="alert" className="text-red-400 text-sm">{pwError}</p>}
      </section>

      <section>
        <h2 className="font-semibold mb-2">{t('super.detail.leagues')}</h2>
        {leagues.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('super.detail.noLeagues')}</p>
        ) : (
          <ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
                <LeagueLogo league={l} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{l.name}</p>
                  <a href={`/l/${l.slug}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline" dir="ltr">/l/{l.slug}</a>
                  <p className="text-xs text-gray-400">{t('super.sessionCount', { count: l.session_count })}</p>
                </div>
                <DeleteLeagueDialog league={l} onDeleted={() => setLeagues((list) => list.filter((x) => x.id !== l.id))} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
