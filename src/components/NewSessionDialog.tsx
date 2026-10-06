import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { serverErrorKey } from '../lib/errorText'
import { useAdminPath, useLeague } from '../contexts/LeagueContext'

export const TEAMS = { min: 2, max: 6 }
export const PER_TEAM = { min: 3, max: 11 }

interface StepperProps { label: string; value: number; min: number; max: number; less: string; more: string; onChange: (n: number) => void }

function Stepper({ label, value, min, max, less, more, onChange }: StepperProps) {
  const id = useId()
  const button = 'w-11 h-11 rounded-lg bg-gray-700 text-xl font-bold disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={less} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>−</button>
        <output aria-labelledby={id} className="w-8 text-center text-xl font-bold">{value}</output>
        <button type="button" aria-label={more} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>+</button>
      </div>
    </div>
  )
}

// Start a session: the date, how many teams and how many players each. Defaults to the league's last setup.
export function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const navigate = useNavigate()
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [teamCount, setTeamCount] = useState(3)
  const [teamSize, setTeamSize] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    supabase.from('sessions').select('team_count, team_size').eq('league_id', league.id)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const last = (data ?? [])[0] as { team_count?: number; team_size?: number } | undefined
        if (stale || !last?.team_count || !last.team_size) return
        setTeamCount(last.team_count)
        setTeamSize(last.team_size)
      })
    return () => { stale = true }
  }, [league.id])

  const create = async () => {
    if (busy || !date) return
    setBusy(true)
    setError('')
    const { data, error: saveError } = await supabase.from('sessions')
      .insert({ league_id: league.id, date, status: 'draft', share_token: crypto.randomUUID(), team_count: teamCount, team_size: teamSize })
      .select().single()
    setBusy(false)
    if (saveError || !data) { setError(t(serverErrorKey(saveError?.message))); return }
    navigate(adminPath(`/sessions/${(data as { id: string }).id}/players`))
  }

  // Escape closes (unless saving); Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !formRef.current) return
    const focusable = [...formRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onSubmit={(e) => { e.preventDefault(); create() }}
        className="w-full max-w-sm bg-gray-900 rounded-xl p-5 space-y-4"
      >
        <h2 id={titleId} className="text-lg font-bold">{t('session.newTitle')}</h2>
        <label className="block">
          <span className="block text-sm text-gray-300 mb-1">{t('session.date')}</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} autoFocus
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
        </label>
        <Stepper label={t('session.teams')} value={teamCount} min={TEAMS.min} max={TEAMS.max}
          less={t('session.fewerTeams')} more={t('session.moreTeams')} onChange={setTeamCount} />
        <Stepper label={t('session.perTeam')} value={teamSize} min={PER_TEAM.min} max={PER_TEAM.max}
          less={t('session.fewerPerTeam')} more={t('session.morePerTeam')} onChange={setTeamSize} />
        <p className="text-sm text-gray-400 text-center">{t('session.upTo', { count: teamCount * teamSize })}</p>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-800 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !date} className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold disabled:opacity-50">
            {t('session.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
