import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createAdmin } from '../../lib/adminApi'
import { serverErrorKey } from '../../lib/errorText'
import { FEATURES, type FeatureKey } from '../../lib/features'
import { validateCreateAdmin } from '../../../supabase/functions/_shared/validate.ts'
import FeatureChecklist from '../../components/FeatureChecklist'

const FIELD_ERRORS: [string, string][] = [
  ['invalid email', 'email'],
  ['password', 'password'],
  ['display_name', 'name'],
  ['max_leagues', 'maxLeagues'],
  ['invalid features', 'features'],
]

export default function NewAdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [maxLeagues, setMaxLeagues] = useState('1')
  const [features, setFeatures] = useState<FeatureKey[]>([...FEATURES])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const checked = validateCreateAdmin({
      email, password, display_name: name, max_leagues: maxLeagues.trim() === '' ? NaN : Number(maxLeagues), features,
    })
    if (!checked.ok) {
      const hit = FIELD_ERRORS.find(([prefix]) => checked.error.startsWith(prefix))
      setError(t(`super.errors.${hit ? hit[1] : 'generic'}`))
      return
    }
    setError('')
    setBusy(true)
    const res = await createAdmin(checked.value)
    setBusy(false)
    if ('error' in res) {
      setError(t(serverErrorKey(res.error)))
      return
    }
    navigate(res.user_id ? `/super/admins/${res.user_id}` : '/super')
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white'
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('super.newAdmin.title')}</h1>
        <Link to="/super" className="text-sm text-gray-400 hover:text-white">{t('super.newAdmin.back')}</Link>
      </div>

      <label className="block">
        <span className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.name')}</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <label className="block">
        <span className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.email')}</span>
        <input className={input} type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div>
        <label htmlFor="new-admin-password" className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.password')}</label>
        <div className="flex gap-2">
          <input
            id="new-admin-password"
            className={input}
            dir="ltr"
            autoComplete="new-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="px-3 rounded-lg bg-gray-800 text-gray-300 text-sm shrink-0"
          >
            {showPassword ? t('super.newAdmin.hide') : t('super.newAdmin.show')}
          </button>
        </div>
      </div>
      <label className="block">
        <span className="block text-sm text-gray-300 mb-1">{t('super.newAdmin.maxLeagues')}</span>
        <input className={input} type="number" min={0} max={100} value={maxLeagues} onChange={(e) => setMaxLeagues(e.target.value)} />
      </label>

      <div>
        <p className="text-sm text-gray-300 mb-1">{t('super.newAdmin.features')}</p>
        <FeatureChecklist value={features} onChange={setFeatures} />
      </div>

      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? t('super.newAdmin.creating') : t('super.newAdmin.create')}
      </button>
    </form>
  )
}
