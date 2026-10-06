import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useLeague } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import { PositionBadge } from './PlayersPage'
import type { Player, Session } from '../../lib/types'

interface AttendancePickerProps {
  players: Player[]
  selected: Set<string>
  limit: number
  onToggle: (id: string) => void
}

export function AttendancePicker({ players, selected, limit, onToggle }: AttendancePickerProps) {
  return (
    <div>
      <div className="mb-3 text-sm text-gray-400 font-semibold">{selected.size} / {limit}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {players.map((p) => {
          const isSelected = selected.has(p.id)
          const isDisabled = !isSelected && selected.size >= limit
          return (
            <button
              key={p.id}
              data-testid={`player-${p.id}`}
              disabled={isDisabled}
              onClick={() => onToggle(p.id)}
              className={`p-3 rounded-lg text-left border transition-colors ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <div className="font-medium text-sm truncate">{p.name}</div>
              <div className="flex items-center gap-1 mt-1">
                <PositionBadge position={p.position} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Who is coming: up to teams × players per team, at least one player per team.
export default function AttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const league = useLeague()
  const adminPath = useAdminPath()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', sessionId).eq('league_id', league.id).maybeSingle()
      .then(({ data }) => { if (data) setSession(data as Session) })
    supabase.from('players').select('*').eq('league_id', league.id).eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setPlayers(data as Player[]) })
  }, [sessionId, league.id])

  const limit = session ? session.team_count * session.team_size : 0

  const togglePlayer = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < limit) next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    if (!sessionId || saving) return
    setSaving(true)
    const rows = Array.from(selected).map((playerId) => ({ session_id: sessionId, player_id: playerId }))
    const { error } = await supabase.from('session_players').insert(rows)
    setSaving(false)
    if (!error) navigate(adminPath(`/sessions/${sessionId}/teams`))
  }

  if (!session) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">{t('session.attendeesTitle')}</h1>
      <p className="text-sm text-gray-300 mb-1">
        {session.date} · {t('session.setup', { teams: session.team_count, size: session.team_size })}
      </p>
      <p className="text-gray-400 text-sm mb-4">{t('session.attendeesHint')}</p>
      <AttendancePicker players={players} selected={selected} limit={limit} onToggle={togglePlayer} />
      <div className="mt-6">
        <button
          onClick={handleConfirm}
          disabled={saving || selected.size < session.team_count}
          className="px-6 py-2 bg-green-600 rounded font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {t('session.confirmAttendance')}
        </button>
      </div>
    </div>
  )
}
