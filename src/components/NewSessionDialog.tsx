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

// Label above, − value + below, so two fit side by side on a phone.
// At a limit the button stays focusable (aria-disabled, not disabled) so keyboard focus isn't lost
function Stepper({ label, value, min, max, less, more, display, onChange }: StepperProps) {
  const id = useId()
  const button = 'w-9 h-9 shrink-0 rounded-lg bg-gray-700 text-lg font-bold aria-disabled:opacity-40'
  return (
    <div className="min-w-0">
      <span id={id} className="block text-xs text-gray-400 mb-1 leading-tight">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={less} aria-disabled={value <= min} onClick={() => { if (value > min) onChange(value - 1) }} className={button}>−</button>
        <output aria-labelledby={id} className="flex-1 text-center text-lg font-bold">{display ?? value}</output>
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

  const chip = (on: boolean) => `px-1 py-2 rounded-lg text-xs sm:text-sm ${on ? 'bg-blue-600 font-semibold' : 'bg-gray-800'} disabled:opacity-40`

  // Fits a 360×640 phone without scrolling. On anything smaller (or with large text) only the middle
  // scrolls, so the title and the Create button always stay on screen.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onSubmit={(e) => { e.preventDefault(); create() }}
        className="w-full max-w-sm max-h-full flex flex-col bg-gray-900 rounded-xl"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <h2 id={titleId} className="text-lg font-bold">{t('session.newTitle')}</h2>
          <label className="shrink-0">
            <span className="sr-only">{t('session.date')}</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} autoFocus
              className="px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm" />
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-3">
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label={t('session.teams')} value={teamCount} min={TEAMS.min} max={TEAMS.max}
                less={t('session.fewerTeams')} more={t('session.moreTeams')} onChange={chooseTeams} />
              <Stepper label={t('session.perTeam')} value={teamSize} min={PER_TEAM.min} max={PER_TEAM.max}
                less={t('session.fewerPerTeam')} more={t('session.morePerTeam')} onChange={chooseSize} />
            </div>
            <p className="mt-1 text-xs text-gray-400 text-center">{t('session.upTo', { count: teamCount * teamSize })}</p>
          </div>

          <div className="border-t border-gray-800 pt-3 space-y-3">
            <div role="radiogroup" aria-label={t('format.mode')} className="grid grid-cols-4 gap-1.5">
              {(['quick', 'halves', 'knockout', 'custom'] as const).map((name) => (
                <button key={name} type="button" role="radio" aria-checked={chosen === name} disabled={name === 'custom' && chosen !== 'custom'}
                  onClick={() => { if (name !== 'custom') choosePreset(name) }}
                  className={chip(chosen === name)}>
                  {t(`format.${name}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stepper label={t('format.periods')} value={fmt.period_count} min={1} max={2}
                less={t('format.fewerPeriods')} more={t('format.morePeriods')} onChange={(n) => editFormat({ period_count: n })} />
              <Stepper label={t('format.minutes')} value={fmt.period_minutes} min={1} max={45}
                less={t('format.fewerMinutes')} more={t('format.moreMinutes')} onChange={(n) => editFormat({ period_minutes: n })} />
              <Stepper label={t('format.extraTime')} value={fmt.extra_time_minutes ?? 0} min={0} max={15} display={fmt.extra_time_minutes ? undefined : t('format.off')}
                less={t('format.fewerExtraTime')} more={t('format.moreExtraTime')} onChange={(n) => editFormat({ extra_time_minutes: n || null })} />
              <Stepper label={t('format.goalLimit')} value={fmt.goal_limit ?? 0} min={0} max={10} display={fmt.goal_limit ? undefined : t('format.off')}
                less={t('format.lowerGoalLimit')} more={t('format.higherGoalLimit')} onChange={(n) => editFormat({ goal_limit: n || null })} />
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <div>
                <span className="block text-xs text-gray-400 mb-1 leading-tight">{t('format.penalties')}</span>
                <button type="button" role="switch" aria-checked={fmt.penalties} aria-label={t('format.penalties')}
                  onClick={() => editFormat({ penalties: !fmt.penalties })}
                  className={`w-14 h-9 rounded-full p-1.5 transition-colors ${fmt.penalties ? 'bg-blue-600' : 'bg-gray-700'}`}>
                  <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${fmt.penalties ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="min-w-0">
                <span className="block text-xs text-gray-400 mb-1 leading-tight">{t('format.drawRule')}</span>
                <div role="radiogroup" aria-label={t('format.drawRule')} className="grid grid-cols-2 gap-1.5">
                  {(['stay', 'draw'] as const).map((rule) => (
                    <button key={rule} type="button" role="radio" aria-checked={!fmt.penalties && fmt.draw_rule === rule} disabled={fmt.penalties}
                      aria-label={t(rule === 'stay' ? 'format.drawStay' : 'format.drawDraw')}
                      onClick={() => editFormat({ draw_rule: rule })}
                      className={`${chip(!fmt.penalties && fmt.draw_rule === rule)} h-9 leading-tight`}>
                      {t(rule === 'stay' ? 'format.drawStayShort' : 'format.drawDrawShort')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <MatchFormatLine format={fmt} />
          </div>
        </div>

        <div className="px-4 pt-3 pb-4 space-y-2">
          {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-gray-800 text-sm disabled:opacity-50">{t('common.cancel')}</button>
            <button type="submit" disabled={busy || !date} className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold disabled:opacity-50">
              {t('session.create')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
