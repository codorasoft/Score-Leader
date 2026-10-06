import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { serverErrorKey } from '../lib/errorText'
import { LanguageToggle } from '../components/LanguageToggle'

export default function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // While Supabase checks the stored session, show a neutral spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">{t('common.loading')}</div>
      </div>
    )
  }

  // Already authenticated — skip the login form entirely
  if (user) {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/admin')
    } catch (err) {
      setError(t(serverErrorKey(err instanceof Error ? err.message : undefined)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Score<span className="text-blue-400">Leader</span></h1>
          <LanguageToggle />
        </div>
        {/* autocomplete="on" + named fields lets the browser save/fill credentials */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
          />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  )
}
