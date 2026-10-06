import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature } from '../../contexts/LeagueContext'
import { computePlayerStats, getAutoAwardWinner } from '../../utils/stats'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { VoteLinks, type CreatedVote } from '../../components/VoteLinks'
import type { Player, Match, MatchEvent, TeamPlayer, SessionAward } from '../../lib/types'

type ChosenAward = 'mvp' | 'best_goalkeeper' | 'fair_play'
type AwardDecision = 'admin_direct' | 'vote'

interface Choice {
  decision: AwardDecision
  winner: string | null
  nominees: string[]
}

const CHOSEN_AWARDS: { type: ChosenAward; labelKey: string }[] = [
  { type: 'mvp', labelKey: 'awards.mvp' },
  { type: 'best_goalkeeper', labelKey: 'awards.bestGk' },
  { type: 'fair_play', labelKey: 'awards.fairPlay' },
]

const MIN_NOMINEES = 2

export default function AwardsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const adminPath = useAdminPath()
  const voting = useFeature('voting')
  const { t } = useTranslation()

  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [teamPlayerMap, setTeamPlayerMap] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [createdVotes, setCreatedVotes] = useState<CreatedVote[] | null>(null)
  const [choices, setChoices] = useState<Record<ChosenAward, Choice>>({
    mvp: { decision: 'admin_direct', winner: null, nominees: [] },
    best_goalkeeper: { decision: 'admin_direct', winner: null, nominees: [] },
    fair_play: { decision: 'admin_direct', winner: null, nominees: [] },
  })

  useEffect(() => {
    const load = async () => {
      const [{ data: spData }, { data: matchData }, { data: teamData }] = await Promise.all([
        supabase.from('session_players').select('player_id').eq('session_id', sessionId),
        supabase.from('matches').select('*').eq('session_id', sessionId),
        supabase.from('teams').select('id').eq('session_id', sessionId),
      ])
      // Awards are per session: only this session's events and team assignments count
      const matchIds = (matchData ?? []).map((m: { id: string }) => m.id)
      const teamIds = (teamData ?? []).map((tm: { id: string }) => tm.id)
      const [{ data: evData }, { data: tpData }] = await Promise.all([
        matchIds.length ? supabase.from('match_events').select('*').in('match_id', matchIds) : Promise.resolve({ data: [] }),
        teamIds.length ? supabase.from('team_players').select('*').in('team_id', teamIds) : Promise.resolve({ data: [] }),
      ])

      const playerIds = (spData ?? []).map((r: { player_id: string }) => r.player_id)
      if (playerIds.length > 0) {
        const { data: pData } = await supabase.from('players').select('*').in('id', playerIds)
        setPlayers(((pData ?? []) as Player[]).sort((a, b) => a.name.localeCompare(b.name)))
      }

      setMatches((matchData ?? []) as Match[])
      setEvents((evData ?? []) as MatchEvent[])

      const map: Record<string, string[]> = {}
      for (const tp of (tpData ?? []) as TeamPlayer[]) (map[tp.player_id] ??= []).push(tp.team_id)
      setTeamPlayerMap(map)
    }
    load()
  }, [sessionId])

  const stats = computePlayerStats(players, events, matches, teamPlayerMap)
  const bestScorer = getAutoAwardWinner(stats, 'best_goalscorer')
  const bestAssister = getAutoAwardWinner(stats, 'best_assister')

  const update = (type: ChosenAward, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [type]: { ...c[type], ...patch } }))
  const notEnoughNominees = CHOSEN_AWARDS.some(({ type }) =>
    choices[type].decision === 'vote' && choices[type].nominees.length < MIN_NOMINEES)

  const handleSave = async () => {
    if (!sessionId || notEnoughNominees) return
    setSaving(true)
    const awards: Omit<SessionAward, 'id' | 'league_id'>[] = []
    const votes: CreatedVote[] = []

    if (bestScorer.winner) {
      awards.push({ session_id: sessionId, award_type: 'best_goalscorer', winner_player_id: bestScorer.winner.player.id, decided_by: 'auto_stat', is_tied: bestScorer.tied })
    }
    if (bestAssister.winner) {
      awards.push({ session_id: sessionId, award_type: 'best_assister', winner_player_id: bestAssister.winner.player.id, decided_by: 'auto_stat', is_tied: bestAssister.tied })
    }

    for (const { type } of CHOSEN_AWARDS) {
      const choice = choices[type]
      if (choice.decision === 'admin_direct') {
        if (choice.winner) {
          awards.push({ session_id: sessionId, award_type: type, winner_player_id: choice.winner, decided_by: 'admin_direct', is_tied: false })
        }
        continue
      }
      const voteToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const { data: voteRow } = await supabase.from('award_votes').insert({
        session_id: sessionId, award_type: type, status: 'open', decided_by: 'vote', vote_token: voteToken,
      }).select().single()
      if (!voteRow) { setSaving(false); return }
      const { error } = await supabase.from('award_vote_nominations').insert(
        choice.nominees.map((pid) => ({ award_vote_id: (voteRow as { id: string }).id, player_id: pid })),
      )
      if (error) { setSaving(false); return }
      votes.push({ awardType: type, token: voteToken })
    }

    if (awards.length > 0) {
      const { error } = await supabase.from('session_awards').insert(awards)
      if (error) { setSaving(false); return }
    }

    await supabase.from('sessions').update({ status: 'completed' }).eq('id', sessionId)
    setSaving(false)
    if (votes.length > 0) setCreatedVotes(votes)
    else navigate(adminPath('/history'))
  }

  if (createdVotes) return <VoteLinks votes={createdVotes} onDone={() => navigate(adminPath(`/sessions/${sessionId}`))} />

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">{t('awards.title')}</h1>

      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm uppercase text-gray-400">{t('awards.autoCalc')}</h2>
        <AwardRow label={t('awards.bestScorer')} winner={bestScorer.winner?.player.name} tied={bestScorer.tied} tiedLabel={t('awards.tied')} />
        <AwardRow label={t('awards.bestAssister')} winner={bestAssister.winner?.player.name} tied={bestAssister.tied} tiedLabel={t('awards.tied')} />
      </section>

      <SessionTopPlayers players={players} events={events} matches={matches} />

      {CHOSEN_AWARDS.map(({ type, labelKey }) => (
        <AwardChoiceSection
          key={type}
          title={t(labelKey)}
          choice={choices[type]}
          voting={voting}
          players={type === 'best_goalkeeper' ? goalkeepersFirst(players) : players}
          hint={type === 'best_goalkeeper' ? t('awards.gkFirst') : undefined}
          onChange={(patch) => update(type, patch)}
        />
      ))}

      {notEnoughNominees && <p className="text-sm text-yellow-300">{t('awards.nomineesHint')}</p>}

      <button
        onClick={handleSave}
        disabled={saving || notEnoughNominees}
        className="w-full py-3 bg-green-600 rounded-xl font-bold disabled:opacity-50"
      >
        {saving ? t('awards.saving') : t('awards.finishSession')}
      </button>
    </div>
  )
}

const goalkeepersFirst = (players: Player[]) =>
  [...players].sort((a, b) => Number(b.position === 'GK') - Number(a.position === 'GK'))

function AwardChoiceSection({ title, choice, players, hint, voting, onChange }: {
  title: string
  voting: boolean
  choice: Choice
  players: Player[]
  hint?: string
  onChange: (patch: Partial<Choice>) => void
}) {
  const { t } = useTranslation()
  const tab = (decision: AwardDecision, label: string) => (
    <button
      onClick={() => onChange({ decision })}
      aria-pressed={choice.decision === decision}
      className={`px-3 py-1.5 rounded text-sm ${choice.decision === decision ? 'bg-blue-600' : 'bg-gray-700'}`}
    >
      {label}
    </button>
  )
  const toggleNominee = (pid: string) => onChange({
    nominees: choice.nominees.includes(pid) ? choice.nominees.filter((x) => x !== pid) : [...choice.nominees, pid],
  })

  return (
    <section className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <div className="flex gap-2">
        {tab('admin_direct', t('awards.adminPicks'))}
        {voting && tab('vote', t('awards.openVote'))}
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => {
          const active = choice.decision === 'admin_direct' ? choice.winner === p.id : choice.nominees.includes(p.id)
          return (
            <button
              key={p.id}
              aria-pressed={active}
              onClick={() => (choice.decision === 'admin_direct' ? onChange({ winner: p.id }) : toggleNominee(p.id))}
              className={`px-3 py-2 rounded text-sm text-start flex items-center gap-2 ${
                active ? (choice.decision === 'admin_direct' ? 'bg-green-600' : 'bg-blue-600') : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {p.position === 'GK' && <span className="text-[10px] font-bold px-1 rounded bg-yellow-600">GK</span>}
              <span className="truncate">{p.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AwardRow({ label, winner, tied, tiedLabel }: { label: string; winner?: string; tied: boolean; tiedLabel: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-semibold">
        {winner ? (tied ? `${winner} ${tiedLabel}` : winner) : '—'}
      </span>
    </div>
  )
}
