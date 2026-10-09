import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { serverErrorKey } from '../lib/errorText'
import { useAdminPath, useLeague } from '../contexts/LeagueContext'
import { DEFAULT_FORMAT, PRESETS, presetName, type MatchFormat, type PresetName } from '../utils/matchFormat'
import { MatchFormatLine } from './MatchFormatLine'

export const TEAMS = { min: 2, max: 6 }
export const PER_TEAM = { min: 3, max: 11 }

interface StepperProps { label: string; value: number; min: number; max: number; less: string; more: string; display?: string; onChange: (n: number) => void }

// At a limit the button stays focusable (aria-disabled, not disabled) so keyboard focus isn't lost
function Stepper({ label, value, min, max, less, more, display, onChange }: StepperProps) {
  const id = useId()
  const button = 'w-11 h-11 rounded-lg bg-gray-700 text-xl font-bold aria-disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={less} aria-disabled={value <= min} onClick={() => { if (value > min) onChange(value - 1) }} className={button}>−</button>
        <output aria-labelledby={id} className="w-8 text-center text-xl font-bold">{display ?? value}</output>
        <button type="button" aria-label={more} aria-disabled={value >= max} onClick={() => { if (value < max) onChange(value + 1) }} className={button}>+</button>
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
  // Once the admin changes a number, the last session's setup no longer replaces it
  const touched = useRef(false)
  const chooseTeams = (n: number) => { touched.current = true; setTeamCount(n) }
  const chooseSize = (n: number) => { touched.current = true; setTeamSize(n) }
  const [fmt, setFmt] = useState<MatchFormat>(DEFAULT_FORMAT)
  const chosen = presetName(fmt)
  const editFormat = (patch: Partial<MatchFormat>) => { touched.current = true; setFmt((f) => ({ ...f, ...patch })) }
  const choosePreset = (name: PresetName) => { touched.current = true; setFmt(PRESETS[name]) }

  useEffect(() => {
    let stale = false
    supabase.from('sessions').select('team_count, team_size, period_count, period_minutes, extra_time_minutes, penalties, goal_limit, draw_rule').eq('league_id', league.id)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const last = (data ?? [])[0] as (Partial<MatchFormat> & { team_count?: number; team_size?: number }) | undefined
        if (stale || touched.current || !last?.team_count || !last.team_size) return
        setTeamCount(last.team_count)
        setTeamSize(last.team_size)
        if (last.period_count != null && last.period_minutes != null && last.penalties != null && last.draw_rule) {
          setFmt({ period_count: last.period_count, period_minutes: last.period_minutes, extra_time_minutes: last.extra_time_minutes ?? null, penalties: last.penalties, goal_limit: last.goal_limit ?? null, draw_rule: last.draw_rule })
        }
      })
    return () => { stale = true }
  }, [league.id])

  const create = async () => {
    if (busy || !date) return
    setBusy(true)
    setError('')
    const { data, error: saveError } = await supabase.from('sessions')
      .insert({ league_id: league.id, date, status: 'draft', share_token: crypto.randomUUID(), team_count: teamCount, team_size: teamSize, ...fmt })
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
          less={t('session.fewerTeams')} more={t('session.moreTeams')} onChange={chooseTeams} />
        <Stepper label={t('session.perTeam')} value={teamSize} min={PER_TEAM.min} max={PER_TEAM.max}
          less={t('session.fewerPerTeam')} more={t('session.morePerTeam')} onChange={chooseSize} />
        <p className="text-sm text-gray-400 text-center">{t('session.upTo', { count: teamCount * teamSize })}</p>
        <div role="radiogroup" aria-label={t('format.mode')} className="grid grid-cols-4 gap-2">
          {(['quick', 'halves', 'knockout', 'custom'] as const).map((name) => (
            <button key={name} type="button" role="radio" aria-checked={chosen === name} disabled={name === 'custom' && chosen !== 'custom'}
              onClick={() => { if (name !== 'custom') choosePreset(name) }}
              className={`px-2 py-2 rounded-lg text-sm ${chosen === name ? 'bg-blue-600 font-semibold' : 'bg-gray-800'} disabled:opacity-40`}>
              {t(`format.${name}`)}
            </button>
          ))}
        </div>
        <Stepper label={t('format.periods')} value={fmt.period_count} min={1} max={2}
          less={t('format.fewerPeriods')} more={t('format.morePeriods')} onChange={(n) => editFormat({ period_count: n })} />
        <Stepper label={t('format.minutes')} value={fmt.period_minutes} min={1} max={45}
          less={t('format.fewerMinutes')} more={t('format.moreMinutes')} onChange={(n) => editFormat({ period_minutes: n })} />
        <Stepper label={t('format.extraTime')} value={fmt.extra_time_minutes ?? 0} min={0} max={15} display={fmt.extra_time_minutes ? undefined : t('format.off')}
          less={t('format.fewerExtraTime')} more={t('format.moreExtraTime')} onChange={(n) => editFormat({ extra_time_minutes: n || null })} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-300">{t('format.penalties')}</span>
          <button type="button" role="switch" aria-checked={fmt.penalties} aria-label={t('format.penalties')}
            onClick={() => editFormat({ penalties: !fmt.penalties })}
            className={`w-14 h-8 rounded-full p-1 transition-colors ${fmt.penalties ? 'bg-blue-600' : 'bg-gray-700'}`}>
            <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${fmt.penalties ? 'translate-x-6 rtl:-translate-x-6' : ''}`} />
          </button>
        </div>
        <Stepper label={t('format.goalLimit')} value={fmt.goal_limit ?? 0} min={0} max={10} display={fmt.goal_limit ? undefined : t('format.off')}
          less={t('format.lowerGoalLimit')} more={t('format.higherGoalLimit')} onChange={(n) => editFormat({ goal_limit: n || null })} />
        <div className="space-y-1">
          <span className="block text-sm text-gray-300">{t('format.drawRule')}</span>
          <div role="radiogroup" aria-label={t('format.drawRule')} className="grid grid-cols-2 gap-2">
            {(['stay', 'draw'] as const).map((rule) => (
              <button key={rule} type="button" role="radio" aria-checked={!fmt.penalties && fmt.draw_rule === rule} disabled={fmt.penalties}
                onClick={() => editFormat({ draw_rule: rule })}
                className={`px-2 py-2 rounded-lg text-xs ${!fmt.penalties && fmt.draw_rule === rule ? 'bg-blue-600 font-semibold' : 'bg-gray-800'} disabled:opacity-40`}>
                {t(rule === 'stay' ? 'format.drawStay' : 'format.drawDraw')}
              </button>
            ))}
          </div>
        </div>
        <MatchFormatLine format={fmt} />
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg bg-gray-800 text-sm disabled:opacity-50">{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !date} className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold disabled:opacity-50">
            {t('session.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
