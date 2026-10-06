import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLeague, usePublicPath } from '../../contexts/LeagueContext'
import { useMyLeagues } from '../../contexts/MyLeaguesContext'
import { LeagueLogo } from '../../components/LeagueLogo'
import { LogoPicker } from '../../components/LogoPicker'
import { updateLeague } from '../../lib/tenancy'
import { deleteLeagueLogo, uploadLeagueLogo } from '../../lib/leagueLogo'
import { copyText, shareToMessenger } from '../../lib/messengerShare'

const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white'
const button = 'px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold disabled:opacity-50'

export default function LeagueSettingsPage() {
  const { t } = useTranslation()
  const league = useLeague()
  const { refresh } = useMyLeagues()
  const publicPath = usePublicPath()
  const [name, setName] = useState(league.name)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const link = `${location.origin}${publicPath()}`
  const trimmed = name.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= 80

  // Runs a save; reports failure instead of throwing, then reloads the league list.
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true)
    setMessage(null)
    let ok = false
    try { ok = await action() } catch { ok = false }
    if (ok) await refresh().catch(() => {})
    setMessage({ text: ok ? t('league.saved') : t('league.saveFailed'), ok })
    setBusy(false)
  }

  const rename = () => run(() => updateLeague(league.id, { name: trimmed }))

  const changeLogo = (blob: Blob) => run(async () => {
    const url = await uploadLeagueLogo(league.id, blob)
    if (!url) return false
    if (!(await updateLeague(league.id, { logo_url: url }))) {
      await deleteLeagueLogo(url).catch(() => {})
      return false
    }
    await deleteLeagueLogo(league.logo_url).catch(() => {})
    return true
  })

  const removeLogo = () => run(async () => {
    if (!(await updateLeague(league.id, { logo_url: null }))) return false
    await deleteLeagueLogo(league.logo_url).catch(() => {})
    return true
  })

  const copy = async () => setMessage((await copyText(link)) ? { text: t('league.copied'), ok: true } : { text: t('league.saveFailed'), ok: false })

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t('league.settings')}</h1>

      <section className="flex items-center gap-3 flex-wrap">
        <LeagueLogo league={league} size="lg" />
        <LogoPicker hasLogo={!!league.logo_url} onPicked={changeLogo} />
        {league.logo_url && (
          <button type="button" disabled={busy} onClick={removeLogo} className="px-3 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-900/40">
            {t('league.removeLogo')}
          </button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('league.name')}
          <input value={name} maxLength={80} onChange={e => setName(e.target.value)} className={input} />
        </label>
        <button type="button" disabled={busy || !nameValid || trimmed === league.name} onClick={rename} className={`${button} self-start`}>
          {t('common.save')}
        </button>
      </section>

      <section className="flex flex-col gap-1 text-sm">
        <span>{t('league.slug')}</span>
        <span dir="ltr" className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-800 text-gray-300 font-mono">{league.slug}</span>
        <span className="text-xs text-gray-400">{t('league.slugReadOnly')}</span>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <span>{t('league.publicLink')}</span>
        <span dir="ltr" className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 font-mono break-all">{link}</span>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={copy} className={button}>{t('league.copy')}</button>
          <button type="button" onClick={() => { void shareToMessenger(link) }} className={button}>{t('league.share')}</button>
        </div>
      </section>

      {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>}
    </div>
  )
}
