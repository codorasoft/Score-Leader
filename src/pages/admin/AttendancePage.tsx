import { useEffect, useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import { serverErrorKey } from '../../lib/errorText'
import { GuestBadge, PositionBadge } from './PlayersPage'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { Player, Session } from '../../lib/types'
import LoadFailed from '../../components/LoadFailed'
import PageSkeleton from '../../components/PageSkeleton'
import { sessionDate } from '../../utils/sessionDate'
import { SetupSteps } from '../../components/SetupSteps'

interface AttendancePickerProps {
  players: Player[]
  selected: Set<string>
  limit: number
  onToggle: (id: string) => void
}

// With a big squad a search box finds a player by name
const SEARCH_FROM = 9

export function AttendancePicker({ players, selected, limit, onToggle }: AttendancePickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const shown = needle ? players.filter((p) => p.name.toLocaleLowerCase().includes(needle)) : players
  return (
    <div>
      {players.length >= SEARCH_FROM && (
        <label className="block mb-3">
          <span className="sr-only">{t('session.searchPlayers')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('session.searchPlayers')}
            className="w-full min-h-[48px] px-4 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500"
          />
        </label>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {shown.map((p) => {
          const isSelected = selected.has(p.id)
          const isDisabled = !isSelected && selected.size >= limit
          return (
            <button
              key={p.id}
              data-testid={`player-${p.id}`}
              disabled={isDisabled}
              aria-pressed={isSelected}
              onClick={() => onToggle(p.id)}
              className={`min-h-[60px] p-2.5 rounded-xl text-start border flex items-center gap-2 ${
                isSelected
                  ? 'bg-blue-600/25 border-blue-400 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-gray-500'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <PlayerAvatar player={p} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm leading-tight line-clamp-2 break-words">{p.name}</span>
                <span className="flex items-center gap-1 mt-1">
                  {p.is_guest ? <GuestBadge /> : <PositionBadge position={p.position} />}
                </span>
              </span>
              <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600'
              }`}>{isSelected ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-gray-400 text-center py-6">{t('session.noPlayerFound')}</p>}
    </div>
  )
}

interface GuestFormProps { full: boolean; onAdd: (name: string) => void }

// A name only: someone who isn't on the Players list joins this booking as a guest
function GuestForm({ full, onAdd }: GuestFormProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const hintId = useId()
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={full}
        className="w-full min-h-[44px] mb-4 px-3 rounded-xl border border-dashed border-gray-600 text-sm font-semibold text-gray-200 hover:border-gray-400 disabled:opacity-40">
        {t('session.addGuest')}
      </button>
    )
  }
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed || full) return
    onAdd(trimmed)
    setName('')
    setOpen(false)
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); add() }} className="mb-4 p-3 rounded-xl bg-gray-800 border border-gray-700">
      <div className="flex gap-2">
        <label className="flex-1 min-w-0">
          <span className="sr-only">{t('session.guestName')}</span>
          <input autoFocus dir="auto" value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setName(''); setOpen(false) } }}
            placeholder={t('session.guestName')} aria-describedby={hintId}
            className="w-full min-h-[44px] px-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder:text-gray-500" />
        </label>
        <button type="submit" disabled={!name.trim() || full} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-sm font-semibold disabled:opacity-50">
          {t('session.addGuestConfirm')}
        </button>
        <button type="button" onClick={() => { setName(''); setOpen(false) }} className="min-h-[44px] px-3 rounded-lg bg-gray-700 text-sm">
          {t('common.cancel')}
        </button>
      </div>
      <p id={hintId} className="mt-2 text-xs text-gray-400">{t('session.guestNameHint')}</p>
    </form>
  )
}

// Who is coming: up to teams × players per team, at least one player per team.
// Guests are added by name; they are saved as players marked is_guest when attendance is confirmed.
export default function AttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const league = useLeague()
  const adminPath = useAdminPath()
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  // This booking's guests: the ones saved earlier and any added now
  const [guests, setGuests] = useState<Player[]>([])
  const [savedGuests, setSavedGuests] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setSession(null)
    setLoadFailed(false)
    Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).eq('league_id', league.id).maybeSingle(),
      supabase.from('session_players').select('player_id').eq('session_id', sessionId),
      supabase.from('players').select('*').eq('league_id', league.id).eq('is_active', true).order('name'),
    ]).then(([booking, picked, squad]) => {
      if (!current) return
      if (booking.error || picked.error || squad.error) { setLoadFailed(true); return }
      if (!booking.data) { navigate(adminPath('/history'), { replace: true }); return }
      const saved = new Set((picked.data as { player_id: string }[]).map((r) => r.player_id))
      const all = squad.data as Player[]
      const ownGuests = all.filter((p) => p.is_guest && saved.has(p.id))
      setSession(booking.data as Session)
      setSelected(saved)
      setPlayers(all.filter((p) => !p.is_guest))
      setGuests(ownGuests)
      setSavedGuests(new Set(ownGuests.map((p) => p.id)))
    }).catch(() => { if (current) setLoadFailed(true) })
    return () => { current = false }
  }, [sessionId, league.id, navigate, adminPath, attempt])

  const limit = session ? session.team_count * session.team_size : 0

  // The players of the league's latest other session that had any, for "Same as last session"
  const [lastPlayers, setLastPlayers] = useState<string[]>([])
  useEffect(() => {
    let stale = false
    supabase.from('sessions').select('id').eq('league_id', league.id).neq('id', sessionId ?? '').order('date', { ascending: false }).limit(5)
      .then(async ({ data }) => {
        const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
        if (ids.length === 0) return
        const { data: picked } = await supabase.from('session_players').select('session_id, player_id').in('session_id', ids)
        const rowsOf = (id: string) => ((picked ?? []) as { session_id: string; player_id: string }[]).filter((r) => r.session_id === id)
        const latest = ids.find((id) => rowsOf(id).length > 0)
        if (!stale && latest) setLastPlayers(rowsOf(latest).map((r) => r.player_id))
      })
    return () => { stale = true }
  }, [sessionId, league.id])

  // Only players still in the squad, and no more than this session has room for
  const lastAvailable = lastPlayers.filter((id) => players.some((p) => p.id === id)).slice(0, limit)
  const useLast = () => setSelected(new Set(lastAvailable))

  const togglePlayer = (id: string) => {
    // A guest added just now and unticked again is dropped, as if never added
    if (selected.has(id) && guests.some((g) => g.id === id) && !savedGuests.has(id)) {
      setGuests((prev) => prev.filter((g) => g.id !== id))
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < limit) next.add(id)
      return next
    })
  }

  const addGuest = (name: string) => {
    if (selected.size >= limit) return
    const guest: Player = {
      id: crypto.randomUUID(), league_id: league.id, name, position: 'MID', skill_rating: 3,
      photo_url: null, is_active: true, is_guest: true, created_at: new Date().toISOString(),
    }
    setGuests((prev) => [...prev, guest])
    setSelected((prev) => new Set(prev).add(guest.id))
  }

  const handleConfirm = async () => {
    if (!sessionId || saving) return
    setSaving(true)
    setError('')
    const newGuests = guests.filter((g) => selected.has(g.id) && !savedGuests.has(g.id))
      .map(({ id, name }) => ({ id, name }))
    const { error: saveError } = await supabase.rpc('save_attendance', {
      p_session_id: sessionId, p_players: [...selected], p_guests: newGuests,
    })
    if (saveError) { setSaving(false); setError(t(serverErrorKey(saveError.message))); return }
    setSaving(false)
    navigate(adminPath(`/sessions/${sessionId}/teams`))
  }

  if (loadFailed) return <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
  if (!session) return <PageSkeleton />

  return (
    <div>
      <SetupSteps current="players" />
      <h1 className="text-xl font-bold mb-1">{t('session.attendeesTitle')}</h1>
      <p className="text-sm text-gray-300 mb-1">
        {sessionDate(session.date, i18n.language)} · {t('session.setup', { teams: t('session.teamsCount', { count: session.team_count }), players: t('session.playersCount', { count: session.team_size }) })}
      </p>
      <p className="text-gray-400 text-sm mb-4">{t('session.attendeesHint')}</p>
      {lastAvailable.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={useLast} className="flex-1 min-h-[44px] px-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-500 text-sm font-semibold">
            {t('session.sameAsLast', { count: lastAvailable.length })}
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-[44px] px-4 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-500 text-sm">
              {t('session.clearPicks')}
            </button>
          )}
        </div>
      )}
      <GuestForm full={selected.size >= limit} onAdd={addGuest} />
      <AttendancePicker players={[...guests, ...players]} selected={selected} limit={limit} onToggle={togglePlayer} />

      {/* Pinned to the bottom of the screen: how many are picked, and the way on */}
      <div className="action-bar">
        {error && <p role="alert" className="text-red-400 text-sm mb-2">{error}</p>}
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-gray-300 font-semibold" aria-live="polite">{t('session.selectedCount', { count: selected.size, limit })}</p>
          <button
            onClick={handleConfirm}
            disabled={saving || selected.size < session.team_count}
            className="min-h-[52px] px-6 bg-green-600 rounded-xl font-bold hover:bg-green-500 disabled:opacity-50"
          >
            {t('session.confirmAttendance')}
          </button>
        </div>
      </div>
    </div>
  )
}
