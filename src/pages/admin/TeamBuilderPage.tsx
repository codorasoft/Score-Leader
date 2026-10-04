import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { balanceTeams } from '../../utils/teamBalancer'
import { TeamSwapBoard } from '../../components/TeamSwapBoard'
import type { Player, Team, TeamColor } from '../../lib/types'

const COLORS: TeamColor[] = ['red', 'blue', 'yellow']

export default function TeamBuilderPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [teams, setTeams] = useState<[Player[], Player[], Player[]]>([[], [], []])
  const [needsGk, setNeedsGk] = useState(false)
  const [saving, setSaving] = useState(false)

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
      <div className="flex justify-between items-center mb-4">
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

      <TeamSwapBoard teams={teams} onChange={setTeams} />

      <div className="mt-6">
        <button
          onClick={handleConfirm}
          disabled={saving || teams.every((t) => t.length === 0)}
          className="w-full sm:w-auto px-6 py-3 bg-green-600 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? t('teamBuilder.saving') : t('teamBuilder.confirmAndStart')}
        </button>
      </div>
    </div>
  )
}
