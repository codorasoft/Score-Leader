import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useMyLeagues } from '../../contexts/MyLeaguesContext'
import { LanguageToggle } from '../../components/LanguageToggle'
import { LeagueLogo } from '../../components/LeagueLogo'
import { LogoPicker } from '../../components/LogoPicker'
import { createLeague, isSlugTaken, updateLeague } from '../../lib/tenancy'
import { deleteLeagueLogo, uploadLeagueLogo } from '../../lib/leagueLogo'
import { slugError, suggestSlug } from '../../lib/slug'

const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white'
const SLUG_MESSAGES = { format: 'league.slugFormat', length: 'league.slugLength', reserved: 'league.slugReserved' } as const

export default function NewLeaguePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { leagues, profile, refresh } = useMyLeagues()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [taken, setTaken] = useState(false)
  const [logo, setLogo] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo])
  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl) }, [logoUrl])

  const formatError = slug ? slugError(slug) : null
  useEffect(() => {
    setTaken(false)
    if (!slug || slugError(slug)) return
    let cancelled = false
    const timer = setTimeout(() => {
      isSlugTaken(slug).then(v => { if (!cancelled) setTaken(v) }, () => {})
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [slug])

  const slugMessage = formatError ? t(SLUG_MESSAGES[formatError]) : taken ? t('league.slugTaken') : null
  const trimmed = name.trim()
  const canCreate = !busy && trimmed.length >= 1 && trimmed.length <= 80 && !!slug && !slugError(slug) && !taken

  const onName = (value: string) => {
    setName(value)
    if (!slugEdited) setSlug(suggestSlug(value))
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createLeague({ owner_id: profile.user_id, name: trimmed, slug })
      if ('error' in result) {
        if (result.error === 'taken') setTaken(true)
        else setError(result.error === 'limit'
          ? t('league.limitReached', { used: leagues.length, max: profile.max_leagues })
          : t('league.createFailed'))
        return
      }
      const created = result.league
      if (logo) {
        const url = await uploadLeagueLogo(created.id, logo).catch(() => null)
        if (!url || !(await updateLeague(created.id, { logo_url: url }).catch(() => false))) {
          if (url) await deleteLeagueLogo(url).catch(() => {})
          window.alert(t('league.logoFailed'))
        }
      }
      // The league exists either way; a failed refresh must not block moving on.
      await refresh().catch(() => {})
      navigate(`/admin/${created.slug}/players`)
    } catch {
      setError(t('league.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-bold text-lg" dir="ltr">Score<span className="text-blue-400">Leader</span></span>
          <div className="flex items-center gap-2 ms-auto">
            {leagues.length > 0 && <Link to="/admin" className="text-sm text-gray-300 hover:text-white">{t('league.back')}</Link>}
            <LanguageToggle />
            <button onClick={signOut} className="h-9 px-3 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800">
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{leagues.length === 0 ? t('league.createFirst') : t('league.new')}</h1>

        <div className="flex items-center gap-3">
          <LeagueLogo league={{ name, logo_url: logoUrl }} size="lg" />
          <LogoPicker hasLogo={!!logo} onPicked={setLogo} />
          {logo && (
            <button type="button" onClick={() => setLogo(null)} className="px-3 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-900/40">
              {t('league.removeLogo')}
            </button>
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          {t('league.name')}
          <input value={name} maxLength={80} onChange={e => onName(e.target.value)} className={input} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t('league.slug')}
          <input
            value={slug}
            dir="ltr"
            maxLength={40}
            onChange={e => { setSlug(e.target.value.toLowerCase()); setSlugEdited(true) }}
            className={input}
          />
        </label>
        <p className="text-xs text-gray-400 -mt-3">{t('league.slugHelp')}</p>
        {slugMessage && <p className="text-sm text-red-400">{slugMessage}</p>}

        {slug && !slugMessage && (
          <p className="text-sm text-gray-300">
            {t('league.publicLink')}: <span dir="ltr" className="font-mono">{`${location.origin}/l/${slug}`}</span>
          </p>
        )}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <button
          onClick={create}
          disabled={!canCreate}
          className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t('league.creating') : t('league.create')}
        </button>
      </main>
    </div>
  )
}
