import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { PositionBadge } from './PlayersPage'
import type { Player } from '../../lib/types'

interface AttendancePickerProps {
  players: Player[]
  selected: Set<string>
  onToggle: (id: string) => void
}

export function AttendancePicker({ players, selected, onToggle }: AttendancePickerProps) {
  return (
    <div>
      <div className="mb-3 text-sm text-gray-400 font-semibold">{selected.size} / 15</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {players.map((p) => {
          const isSelected = selected.has(p.id)
          const isDisabled = !isSelected && selected.size >= 15
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

export default function NewSessionPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [step, setStep] = useState<'date' | 'attendance'>('date')
  const [sessionDate, setSessionDate] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (data) setPlayers(data as Player[]) })
  }, [])

  const handleCreateSession = async () => {
    const { data } = await supabase
      .from('sessions')
      .insert({ date: sessionDate, status: 'draft', share_token: crypto.randomUUID() })
      .select()
      .single()
    if (data) {
      setSessionId(data.id as string)
      setStep('attendance')
    }
  }

  const togglePlayer = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 15) {
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (!sessionId) return
    const rows = Array.from(selected).map((playerId) => ({ session_id: sessionId, player_id: playerId }))
    await supabase.from('session_players').insert(rows)
    navigate(`/admin/sessions/${sessionId}/teams`)
  }

  if (step === 'date') {
    return (
      <div className="max-w-sm">
        <h1 className="text-xl font-bold mb-6">{t('session.title')}</h1>
        <label className="block text-sm text-gray-400 mb-2">{t('session.dateLabel')}</label>
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 mb-4"
        />
        <button
          onClick={handleCreateSession}
          disabled={!sessionDate}
          className="w-full py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {t('session.startSession')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">{t('session.attendeesTitle')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('session.attendeesHint')}</p>
      <AttendancePicker players={players} selected={selected} onToggle={togglePlayer} />
      <div className="mt-6">
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          className="px-6 py-2 bg-green-600 rounded font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {t('session.confirmAttendance')}
        </button>
      </div>
    </div>
  )
}
