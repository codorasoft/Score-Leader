import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import { selectAllOrThrow } from '../../lib/selectAll'
import {
  deleteCoachEvent, fetchCoachEvent, fetchLineupOptions, fetchLineupSpots, saveCoachEvent, type LineupOption,
} from '../../lib/coachApi'
import type { Attendance, CoachEntry, CoachEvent, CoachEventKind, MatchRole, MatchType, Player, PlayerPosition } from '../../lib/types'
import { MATCH_TYPES, POSITIONS, positionFromSpot } from '../../utils/coachRating'
import { localToday } from '../../utils/trainingDays'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageSkeleton from '../../components/PageSkeleton'
import NotAvailablePage from '../NotAvailablePage'

const ATTENDANCE: readonly Attendance[] = ['present', 'late', 'excused', 'absent']
const ROLES: readonly (MatchRole | 'none')[] = ['none', 'starter', 'sub', 'unused']
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const ATTENDANCE_STYLE: Record<Attendance, string> = {
  present: 'bg-green-700 border-green-600 text-white',
  late: 'bg-yellow-700 border-yellow-600 text-white',
  excused: 'bg-gray-600 border-gray-500 text-white',
  absent: 'bg-gray-800 border-gray-700 text-gray-400',
}

// A player's line on the day as it is being edited. role 'none' is a match player not in the squad.
interface Line {
  attendance: Attendance
  role: MatchRole | 'none'
  position: PlayerPosition
  rating: number | null
  goals: number
  assists: number
}

const blankLine = (player: Player, kind: CoachEventKind): Line => ({
  attendance: kind === 'training' ? 'absent' : 'present',
  role: 'none',
  position: player.position,
  rating: null,
  goals: 0,
  assists: 0,
})

const canRate = (kind: CoachEventKind, line: Line) =>
  kind === 'training' ? line.attendance === 'present' || line.attendance === 'late' : line.role === 'starter' || line.role === 'sub'

// What is saved for each line: every player for a training, the squad for a match
function entriesOf(kind: CoachEventKind, players: Player[], lines: Record<string, Line>): Omit<CoachEntry, 'event_id'>[] {
  return players.flatMap((p): Omit<CoachEntry, 'event_id'>[] => {
    const line = lines[p.id]
    if (!line) return []
    const rating = canRate(kind, line) ? line.rating : null
    if (kind === 'training') {
      return [{ player_id: p.id, attendance: line.attendance, role: null, position: null, rating, goals: 0, assists: 0 }]
    }
    if (line.role === 'none') return []
    const played = line.role !== 'unused'
    return [{
      player_id: p.id, attendance: 'present' as const, role: line.role, position: played ? line.position : null, rating,
      goals: played ? line.goals : 0, assists: played ? line.assists : 0,
    }]
  })
}

const toScore = (text: string): number | null => (text.trim() === '' ? null : Math.max(0, Math.min(99, Math.floor(Number(text)) || 0)))

// One training or match: who came, the role and position each played, and the coach's rating.
// New days come from /coach/new/training or /coach/new/match; saved ones from /coach/days/:eventId.
export default function CoachEventPage() {
  const { eventId, kind: newKind } = useParams()
  const { t } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const navigate = useNavigate()

  const [players, setPlayers] = useState<Player[] | null>(null)
  const [event, setEvent] = useState<CoachEvent | null | undefined>(eventId ? undefined : null)
  const [failed, setFailed] = useState(false)
  const [lineups, setLineups] = useState<LineupOption[]>([])

  const [date, setDate] = useState(localToday())
  const [title, setTitle] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('friendly')
  const [ourScore, setOurScore] = useState('')
  const [theirScore, setTheirScore] = useState('')
  const [lineupId, setLineupId] = useState<string | null>(null)
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [problem, setProblem] = useState<'opponent' | 'score' | 'date' | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const kind: CoachEventKind = event ? event.kind : newKind === 'match' ? 'match' : 'training'

  // Latest request, so a slow response for a day or league we have left is dropped
  const current = useRef('')
  const load = useCallback(() => {
    const request = `${league.id}/${eventId ?? newKind}`
    current.current = request
    setFailed(false)
    setPlayers(null)
    Promise.all([
      selectAllOrThrow<Player>((from, to) =>
        supabase.from('players').select('*').eq('league_id', league.id).order('name').order('id').range(from, to)),
      eventId ? fetchCoachEvent(eventId, league.id) : Promise.resolve(null),
      fetchLineupOptions(league.id).catch(() => [] as LineupOption[]),
    ]).then(([all, found, boards]) => {
      if (current.current !== request) return
      const dayKind: CoachEventKind = found ? found.event.kind : newKind === 'match' ? 'match' : 'training'
      const saved = new Map((found?.entries ?? []).map((e) => [e.player_id, e]))
      // Active players, and anyone no longer active who is on this day
      const shown = all.filter((p) => p.is_active || saved.has(p.id))
      const next: Record<string, Line> = {}
      for (const p of shown) {
        const e = saved.get(p.id)
        next[p.id] = e
          ? { attendance: e.attendance, role: e.role ?? 'starter', position: e.position ?? p.position, rating: e.rating, goals: e.goals, assists: e.assists }
          : blankLine(p, dayKind)
      }
      setLines(next)
      setLineups(boards)
      if (found) {
        const ev = found.event
        setEvent(ev)
        setDate(ev.event_date)
        setTitle(ev.title ?? '')
        setMatchType(ev.match_type ?? 'friendly')
        setOurScore(ev.our_score === null ? '' : String(ev.our_score))
        setTheirScore(ev.their_score === null ? '' : String(ev.their_score))
        setLineupId(ev.lineup_id)
      } else {
        setEvent(null)
      }
      setPlayers(shown)
    }).catch(() => { if (current.current === request) setFailed(true) })
  }, [league.id, eventId, newKind])

  useEffect(load, [load])

  if (failed) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
      </div>
    )
  }
  if (players === null || event === undefined) return <PageSkeleton />
  if (eventId && event === null) return <NotAvailablePage kind="page" embedded />

  const set = (id: string, change: Partial<Line>) => setLines((all) => ({ ...all, [id]: { ...all[id]!, ...change } }))

  const allPresent = () => setLines((all) => Object.fromEntries(
    Object.entries(all).map(([id, line]) => [id, line.attendance === 'absent' ? { ...line, attendance: 'present' as const } : line]),
  ))

  // Players on the board's pitch start, in the position they stand in; the bench are substitutes.
  // Everyone else is left as they were.
  const fromBoard = async (id: string) => {
    setLineupId(id || null)
    if (!id) return
    try {
      const spots = await fetchLineupSpots(id)
      setLines((all) => {
        const next = { ...all }
        for (const s of spots) {
          const line = next[s.player_id]
          if (!line) continue
          next[s.player_id] = s.bench_order === null
            ? { ...line, role: 'starter', position: positionFromSpot(s.y) }
            : { ...line, role: 'sub' }
        }
        return next
      })
    } catch { /* the board stays linked; the lines are left to fill by hand */ }
  }

  const save = async () => {
    if (saving) return
    if (!date) { setProblem('date'); return }
    if (kind === 'match' && !title.trim()) { setProblem('opponent'); return }
    const [ours, theirs] = [toScore(ourScore), toScore(theirScore)]
    if (kind === 'match' && (ours === null) !== (theirs === null)) { setProblem('score'); return }
    setProblem(null)
    setSaving(true)
    const id = await saveCoachEvent(event?.id ?? null, league.id, {
      kind, event_date: date, title, match_type: kind === 'match' ? matchType : null,
      our_score: ours, their_score: theirs, lineup_id: lineupId, players: entriesOf(kind, players, lines),
    })
    // A refused save keeps the form as typed; the failure itself is already on screen as a toast
    if (id) navigate(adminPath('/coach'), { replace: true })
    else setSaving(false)
  }

  const remove = async () => {
    if (!event || saving) return
    setSaving(true)
    if (await deleteCoachEvent(event.id)) navigate(adminPath('/coach'), { replace: true })
    else { setSaving(false); setConfirmDelete(false) }
  }

  const values = Object.values(lines)
  const counts = kind === 'training'
    ? t('coach.counts.training', Object.fromEntries(ATTENDANCE.map((a) => [a, values.filter((l) => l.attendance === a).length])))
    : t('coach.counts.match', {
      starters: values.filter((l) => l.role === 'starter').length,
      subs: values.filter((l) => l.role === 'sub').length,
      unused: values.filter((l) => l.role === 'unused').length,
    })

  // 16px text: an iPhone zooms the whole page when a field with smaller text is tapped
  const field = 'block w-full min-w-0 max-w-full appearance-none mt-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-base text-white'
  const small = 'min-w-0 px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-base text-white'
  const label = 'block min-w-0 text-sm text-gray-400'
  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`

  const heading = event
    ? t(kind === 'match' ? 'coach.editMatch' : 'coach.editTraining')
    : t(kind === 'match' ? 'coach.newMatchTitle' : 'coach.newTrainingTitle')

  return (
    <div className="max-w-lg mx-auto">
      <Link to={adminPath('/coach')} className="text-sm text-blue-400 hover:underline">
        <span aria-hidden="true">‹</span> {t('coach.title')}
      </Link>
      <h1 className="text-xl font-bold mt-2 mb-4">{heading}</h1>

      {/* Not a form: Enter in a field (the phone keyboard's Go key) must not save a half-filled day */}
      <div className="space-y-3 mb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 overflow-hidden p-1 -m-1">
          <label className={label}>
            {t(kind === 'match' ? 'coach.opponent' : 'coach.trainingName')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} dir="auto" className={field} />
          </label>
          <label className={label}>
            {t('coach.date')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
        </div>
        {problem === 'opponent' && <p className="text-sm text-red-400">{t('coach.problems.opponent')}</p>}
        {problem === 'date' && <p className="text-sm text-red-400">{t('coach.problems.date')}</p>}

        {kind === 'match' && (
          <>
            <div role="group" aria-label={t('coach.type')}>
              <p className="text-sm text-gray-400 mb-1">{t('coach.type')}</p>
              <div className="flex flex-wrap gap-2">
                {MATCH_TYPES.map((type) => (
                  <button key={type} type="button" aria-pressed={matchType === type} onClick={() => setMatchType(type)} className={chip(matchType === type)}>
                    {t(`coach.matchType.${type}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-400">{t('coach.score')}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>
                  {t('coach.ourScore')}
                  <input inputMode="numeric" value={ourScore} onChange={(e) => setOurScore(e.target.value.replace(/\D/g, '').slice(0, 2))} className={field} />
                </label>
                <label className={label}>
                  {t('coach.theirScore')}
                  <input inputMode="numeric" value={theirScore} onChange={(e) => setTheirScore(e.target.value.replace(/\D/g, '').slice(0, 2))} className={field} />
                </label>
              </div>
              {problem === 'score' && <p className="text-sm text-red-400 mt-1">{t('coach.problems.score')}</p>}
            </div>
            {lineups.length > 0 && (
              <label className={label}>
                {t('coach.fromBoard')}
                <select value={lineupId ?? ''} onChange={(e) => void fromBoard(e.target.value)} className={field}>
                  <option value="">{t('coach.fromBoardNone')}</option>
                  {lineups.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <span className="block text-xs text-gray-500 mt-1">{t('coach.fromBoardHint')}</span>
              </label>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-semibold">{t('coach.players')}</h2>
        {kind === 'training' && players.length > 0 && (
          <button type="button" onClick={allPresent} className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm">{t('coach.allPresent')}</button>
        )}
      </div>
      {players.length > 0 && <p className="text-xs text-gray-400 mb-2">{counts}</p>}
      {players.length === 0 && <p className="text-gray-500 text-center py-6">{t('coach.noPlayers')}</p>}

      <ul className="space-y-2">
        {players.map((p) => {
          const line = lines[p.id]!
          const rateable = canRate(kind, line)
          const ratingSelect = (
            <select
              value={line.rating ?? ''}
              disabled={!rateable}
              onChange={(e) => set(p.id, { rating: e.target.value ? Number(e.target.value) : null })}
              aria-label={t('coach.ratingOf', { name: p.name })}
              className={`${small} w-16 disabled:opacity-40`}
            >
              <option value="">{t('coach.noRating')}</option>
              {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )
          return (
            <li key={p.id} className="bg-gray-800 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <PlayerAvatar player={p} size="sm" />
                <span className="flex-1 min-w-0 truncate font-medium" dir="auto">{p.name}</span>
                {kind === 'training' ? (
                  <>
                    {/* One tap moves to the next mark: present, late, excused, absent */}
                    <button
                      type="button"
                      onClick={() => set(p.id, { attendance: ATTENDANCE[(ATTENDANCE.indexOf(line.attendance) + 1) % ATTENDANCE.length]! })}
                      aria-label={`${t('coach.attendanceOf', { name: p.name })}: ${t(`coach.attendance.${line.attendance}`)}`}
                      className={`shrink-0 w-20 py-1.5 rounded-full border text-xs font-semibold ${ATTENDANCE_STYLE[line.attendance]}`}
                    >
                      {t(`coach.attendance.${line.attendance}`)}
                    </button>
                    {ratingSelect}
                  </>
                ) : (
                  <select
                    value={line.role}
                    onChange={(e) => set(p.id, { role: e.target.value as Line['role'] })}
                    aria-label={t('coach.roleOf', { name: p.name })}
                    className={`${small} w-32 ${line.role === 'none' ? 'text-gray-400' : ''}`}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{t(`coach.role.${r}`)}</option>)}
                  </select>
                )}
              </div>
              {kind === 'match' && (line.role === 'starter' || line.role === 'sub') && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 mt-2 ps-10">
                  <select
                    value={line.position}
                    onChange={(e) => set(p.id, { position: e.target.value as PlayerPosition })}
                    aria-label={t('coach.positionOf', { name: p.name })}
                    className={`${small} w-full`}
                  >
                    {POSITIONS.map((pos) => <option key={pos} value={pos}>{t(`coach.position.${pos}`)}</option>)}
                  </select>
                  {ratingSelect}
                  <div className="col-span-2 flex items-center justify-between gap-2">
                    <Counter label={t('coach.goalsOf', { name: p.name })} short={t('coach.goals')} value={line.goals} onChange={(goals) => set(p.id, { goals })} />
                    <Counter label={t('coach.assistsOf', { name: p.name })} short={t('coach.assistsShort')} value={line.assists} onChange={(assists) => set(p.id, { assists })} />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Stays in reach under a long squad */}
      <div className="action-bar">
        <button type="button" onClick={save} disabled={saving} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold disabled:opacity-50">
          {t('common.save')}
        </button>
      </div>

      {event && (
        <button onClick={() => setConfirmDelete(true)} className="w-full mt-6 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
          {t('coach.delete')}
        </button>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={t('coach.confirmDelete')}
          confirmLabel={t('coach.delete')}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
          busy={saving}
        />
      )}
    </div>
  )
}

// A small count with − and + either side, for goals and assists
function Counter({ label, short, value, onChange }: { label: string; short: string; value: number; onChange: (v: number) => void }) {
  const btn = 'w-8 h-8 rounded-lg bg-gray-900 border border-gray-700 text-base disabled:opacity-40'
  return (
    <span role="group" aria-label={label} className="flex items-center gap-1 text-sm">
      <span className="text-xs text-gray-400">{short}</span>
      <button type="button" aria-label={`${label} −`} disabled={value <= 0} onClick={() => onChange(value - 1)} className={btn}>−</button>
      <span aria-live="polite" className="w-5 text-center tabular-nums">{value}</span>
      <button type="button" aria-label={`${label} +`} disabled={value >= 50} onClick={() => onChange(value + 1)} className={btn}>+</button>
    </span>
  )
}
