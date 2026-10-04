import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { computePlayerStats, getAutoAwardWinner } from '../../utils/stats'
import type { Player, Match, MatchEvent, TeamPlayer, SessionAward } from '../../lib/types'

type AwardDecision = 'admin_direct' | 'vote'

interface VoteSetup {
  nominees: string[]
  decidedBy: AwardDecision
}

export default function AwardsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [teamPlayerMap, setTeamPlayerMap] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [mvpChoice, setMvpChoice] = useState<string | null>(null)
  const [mvpDecision, setMvpDecision] = useState<AwardDecision>('admin_direct')
  const [mvpVoteSetup, setMvpVoteSetup] = useState<VoteSetup>({ nominees: [], decidedBy: 'vote' })

  const [fairPlayChoice, setFairPlayChoice] = useState<string | null>(null)
  const [fairPlayDecision, setFairPlayDecision] = useState<AwardDecision>('admin_direct')
  const [fairPlayVoteSetup, setFairPlayVoteSetup] = useState<VoteSetup>({ nominees: [], decidedBy: 'vote' })

  useEffect(() => {
    const load = async () => {
      const [{ data: spData }, { data: matchData }, { data: evData }, { data: tpData }] = await Promise.all([
        supabase.from('session_players').select('player_id').eq('session_id', sessionId),
        supabase.from('matches').select('*').eq('session_id', sessionId),
        supabase.from('match_events').select('*'),
        supabase.from('team_players').select('*'),
      ])

      const playerIds = (spData ?? []).map((r: { player_id: string }) => r.player_id)
      if (playerIds.length > 0) {
        const { data: pData } = await supabase.from('players').select('*').in('id', playerIds)
        setPlayers((pData ?? []) as Player[])
      }

      setMatches((matchData ?? []) as Match[])
      setEvents((evData ?? []) as MatchEvent[])

      const map: Record<string, string> = {}
      for (const tp of (tpData ?? []) as TeamPlayer[]) {
        map[tp.player_id] = tp.team_id
      }
      setTeamPlayerMap(map)
    }
    load()
  }, [sessionId])

  const stats = computePlayerStats(players, events, matches, teamPlayerMap)
  const bestScorer = getAutoAwardWinner(stats, 'best_goalscorer')
  const bestAssister = getAutoAwardWinner(stats, 'best_assister')
  const bestGk = getAutoAwardWinner(stats, 'best_goalkeeper')

  const handleSave = async () => {
    setSaving(true)
    const awards: Omit<SessionAward, 'id'>[] = []

    if (bestScorer.winner) {
      awards.push({ session_id: sessionId!, award_type: 'best_goalscorer', winner_player_id: bestScorer.winner.player.id, decided_by: 'auto_stat', is_tied: bestScorer.tied })
    }
    if (bestAssister.winner) {
      awards.push({ session_id: sessionId!, award_type: 'best_assister', winner_player_id: bestAssister.winner.player.id, decided_by: 'auto_stat', is_tied: bestAssister.tied })
    }
    if (bestGk.winner) {
      awards.push({ session_id: sessionId!, award_type: 'best_goalkeeper', winner_player_id: bestGk.winner.player.id, decided_by: 'auto_stat', is_tied: bestGk.tied })
    }

    if (mvpDecision === 'admin_direct' && mvpChoice) {
      awards.push({ session_id: sessionId!, award_type: 'mvp', winner_player_id: mvpChoice, decided_by: 'admin_direct', is_tied: false })
    } else if (mvpDecision === 'vote') {
      const voteToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const { data: voteRow } = await supabase.from('award_votes').insert({
        session_id: sessionId, award_type: 'mvp', status: 'open', decided_by: 'vote', vote_token: voteToken,
      }).select().single()
      if (voteRow && mvpVoteSetup.nominees.length > 0) {
        await supabase.from('award_vote_nominations').insert(
          mvpVoteSetup.nominees.map((pid) => ({ award_vote_id: (voteRow as { id: string }).id, player_id: pid }))
        )
      }
    }

    if (fairPlayDecision === 'admin_direct' && fairPlayChoice) {
      awards.push({ session_id: sessionId!, award_type: 'fair_play', winner_player_id: fairPlayChoice, decided_by: 'admin_direct', is_tied: false })
    } else if (fairPlayDecision === 'vote') {
      const voteToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const { data: voteRow } = await supabase.from('award_votes').insert({
        session_id: sessionId, award_type: 'fair_play', status: 'open', decided_by: 'vote', vote_token: voteToken,
      }).select().single()
      if (voteRow && fairPlayVoteSetup.nominees.length > 0) {
        await supabase.from('award_vote_nominations').insert(
          fairPlayVoteSetup.nominees.map((pid) => ({ award_vote_id: (voteRow as { id: string }).id, player_id: pid }))
        )
      }
    }

    if (awards.length > 0) {
      await supabase.from('session_awards').insert(awards)
    }

    await supabase.from('sessions').update({ status: 'completed' }).eq('id', sessionId)

    setSaving(false)
    navigate('/admin/history')
  }

  const toggleNominee = (list: string[], pid: string): string[] =>
    list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid]

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">{t('awards.title')}</h1>

      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm uppercase text-gray-400">{t('awards.autoCalc')}</h2>
        <AwardRow label={t('awards.bestScorer')} winner={bestScorer.winner?.player.name} tied={bestScorer.tied} tied_label={t('awards.tied')} />
        <AwardRow label={t('awards.bestAssister')} winner={bestAssister.winner?.player.name} tied={bestAssister.tied} tied_label={t('awards.tied')} />
        <AwardRow label={t('awards.bestGk')} winner={bestGk.winner?.player.name} tied={bestGk.tied} tied_label={t('awards.tied')} />
      </section>

      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">{t('awards.mvp')}</h2>
        <div className="flex gap-2">
          <button onClick={() => setMvpDecision('admin_direct')} className={`px-3 py-1 rounded text-sm ${mvpDecision === 'admin_direct' ? 'bg-blue-600' : 'bg-gray-700'}`}>{t('awards.adminPicks')}</button>
          <button onClick={() => setMvpDecision('vote')} className={`px-3 py-1 rounded text-sm ${mvpDecision === 'vote' ? 'bg-blue-600' : 'bg-gray-700'}`}>{t('awards.openVote')}</button>
        </div>
        {mvpDecision === 'admin_direct' && (
          <PlayerPicker players={players} selected={mvpChoice} onSelect={setMvpChoice} />
        )}
        {mvpDecision === 'vote' && (
          <NomineePicker players={players} selected={mvpVoteSetup.nominees}
            onToggle={(pid) => setMvpVoteSetup((v) => ({ ...v, nominees: toggleNominee(v.nominees, pid) }))} />
        )}
      </section>

      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">{t('awards.fairPlay')}</h2>
        <div className="flex gap-2">
          <button onClick={() => setFairPlayDecision('admin_direct')} className={`px-3 py-1 rounded text-sm ${fairPlayDecision === 'admin_direct' ? 'bg-blue-600' : 'bg-gray-700'}`}>{t('awards.adminPicks')}</button>
          <button onClick={() => setFairPlayDecision('vote')} className={`px-3 py-1 rounded text-sm ${fairPlayDecision === 'vote' ? 'bg-blue-600' : 'bg-gray-700'}`}>{t('awards.openVote')}</button>
        </div>
        {fairPlayDecision === 'admin_direct' && (
          <PlayerPicker players={players} selected={fairPlayChoice} onSelect={setFairPlayChoice} />
        )}
        {fairPlayDecision === 'vote' && (
          <NomineePicker players={players} selected={fairPlayVoteSetup.nominees}
            onToggle={(pid) => setFairPlayVoteSetup((v) => ({ ...v, nominees: toggleNominee(v.nominees, pid) }))} />
        )}
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-green-600 rounded-xl font-bold disabled:opacity-50"
      >
        {saving ? t('awards.saving') : t('awards.finishSession')}
      </button>
    </div>
  )
}

function AwardRow({ label, winner, tied, tied_label }: { label: string; winner?: string; tied: boolean; tied_label: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-semibold">
        {winner ? (tied ? `${winner} ${tied_label}` : winner) : '—'}
      </span>
    </div>
  )
}

function PlayerPicker({ players, selected, onSelect }: { players: Player[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {players.map((p) => (
        <button key={p.id} onClick={() => onSelect(p.id)}
          className={`px-3 py-2 rounded text-sm text-left ${selected === p.id ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
          {p.name}
        </button>
      ))}
    </div>
  )
}

function NomineePicker({ players, selected, onToggle }: { players: Player[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {players.map((p) => (
        <button key={p.id} onClick={() => onToggle(p.id)}
          className={`px-3 py-2 rounded text-sm text-left ${selected.includes(p.id) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
          {p.name}
        </button>
      ))}
    </div>
  )
}
