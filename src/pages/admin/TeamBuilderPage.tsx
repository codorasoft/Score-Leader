import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { supabase } from '../../lib/supabase'
import { balanceTeams } from '../../utils/teamBalancer'
import { PositionBadge } from './PlayersPage'
import type { Player, Team, TeamColor } from '../../lib/types'

const COLORS: TeamColor[] = ['red', 'blue', 'yellow']

const colorStyles: Record<TeamColor, string> = {
  red: 'border-red-500 bg-red-900/20',
  blue: 'border-blue-500 bg-blue-900/20',
  yellow: 'border-yellow-500 bg-yellow-900/20',
}

export default function TeamBuilderPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [teams, setTeams] = useState<[Player[], Player[], Player[]]>([[], [], []])
  const [needsGk, setNeedsGk] = useState(false)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor))

  const loadAndBalance = async () => {
    if (!sessionId) return
    const { data: spRows } = await supabase
      .from('session_players')
      .select('player_id')
      .eq('session_id', sessionId)
    if (!spRows) return

    const playerIds = spRows.map((r: { player_id: string }) => r.player_id)
    const { data: playerRows } = await supabase
      .from('players')
      .select('*')
      .in('id', playerIds)
    if (!playerRows) return

    const result = balanceTeams(playerRows as Player[])
    setTeams(result.teams)
    setNeedsGk(result.needsGkAssignment)
  }

  useEffect(() => { loadAndBalance() }, [sessionId])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedPlayerId = active.id as string
    const targetPlayerId = over.id as string

    setTeams((prev) => {
      const next: [Player[], Player[], Player[]] = prev.map((t) => [...t]) as [Player[], Player[], Player[]]
      const srcTeamIdx = next.findIndex((t) => t.some((p) => p.id === draggedPlayerId))
      const dstTeamIdx = next.findIndex((t) => t.some((p) => p.id === targetPlayerId))
      if (srcTeamIdx === -1 || dstTeamIdx === -1 || srcTeamIdx === dstTeamIdx) return prev

      const srcIdx = next[srcTeamIdx].findIndex((p) => p.id === draggedPlayerId)
      const dstIdx = next[dstTeamIdx].findIndex((p) => p.id === targetPlayerId)

      const dragged = next[srcTeamIdx][srcIdx]
      const target = next[dstTeamIdx][dstIdx]

      next[srcTeamIdx][srcIdx] = target
      next[dstTeamIdx][dstIdx] = dragged

      return next
    })
  }

  const handleConfirm = async () => {
    if (!sessionId) return
    setSaving(true)

    const { data: teamRows } = await supabase
      .from('teams')
      .insert(COLORS.map((color) => ({ session_id: sessionId, color })))
      .select()
    if (!teamRows) { setSaving(false); return }

    const teamPlayerRows = (teamRows as Team[]).flatMap((team, idx) =>
      teams[idx].map((p) => ({ team_id: team.id, player_id: p.id }))
    )
    await supabase.from('team_players').insert(teamPlayerRows)

    await supabase.from('sessions').update({ status: 'active' }).eq('id', sessionId)

    const shuffled = [...teamRows].sort(() => Math.random() - 0.5) as Team[]
    const { data: matchData } = await supabase
      .from('matches')
      .insert({
        session_id: sessionId,
        match_number: 1,
        team1_id: shuffled[0].id,
        team2_id: shuffled[1].id,
        waiting_team_id: shuffled[2].id,
        status: 'pending',
      })
      .select()
      .single()

    setSaving(false)
    if (matchData) {
      navigate(`/admin/sessions/${sessionId}/match/${(matchData as { id: string }).id}`)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">{t('teamBuilder.title')}</h1>
        <button
          onClick={loadAndBalance}
          className="px-4 py-2 text-sm bg-gray-700 rounded hover:bg-gray-600"
        >
          {t('teamBuilder.shuffleAll')}
        </button>
      </div>

      {needsGk && (
        <div className="mb-4 p-3 bg-yellow-900/40 border border-yellow-600 rounded-lg text-sm text-yellow-300">
          ⚠ {t('teamBuilder.noGkWarning')}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {COLORS.map((color, idx) => (
            <div key={color} className={`border rounded-xl p-3 ${colorStyles[color]}`}>
              <h2 className="font-bold mb-3">{t('common.teamName', { color: t(`common.teamColor.${color}`) })}</h2>
              <div className="space-y-2">
                {teams[idx].map((player) => (
                  <DraggablePlayer key={player.id} player={player} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DndContext>

      <div className="mt-6">
        <button
          onClick={handleConfirm}
          disabled={saving || teams.every((t) => t.length === 0)}
          className="px-6 py-3 bg-green-600 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? t('teamBuilder.saving') : t('teamBuilder.confirmAndStart')}
        </button>
      </div>
    </div>
  )
}

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

function DraggablePlayer({ player }: { player: Player }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: player.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-gray-700 rounded px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing"
    >
      <PositionBadge position={player.position} />
      <span className="text-sm flex-1 truncate">{player.name}</span>
      <span className="text-xs text-yellow-400">{'★'.repeat(player.skill_rating)}</span>
    </div>
  )
}
