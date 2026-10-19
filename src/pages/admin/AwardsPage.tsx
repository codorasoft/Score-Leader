import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature } from '../../contexts/LeagueContext'
import { computePlayerStats, getAutoAwardWinner, getBestGoalkeepers } from '../../utils/stats'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { VoteLinks, type CreatedVote } from '../../components/VoteLinks'
import type { Player, Match, MatchEvent, TeamPlayer, SessionAward } from '../../lib/types'

// Best goalkeeper is worked out from goals conceded, like the top scorer, so it is not chosen here
type ChosenAward = 'mvp' | 'fair_play'
type AwardDecision = 'admin_direct' | 'vote'

interface Choice {
  decision: AwardDecision
  winner: string | null
  nominees: string[]
}

const CHOSEN_AWARDS: { type: ChosenAward; labelKey: string }[] = [
  { type: 'mvp', labelKey: 'awards.mvp' },
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
  // The last Finish could not be saved (no signal, or the server refused it)
  const [saveFailed, setSaveFailed] = useState(false)
  const [createdVotes, setCreatedVotes] = useState<CreatedVote[] | null>(null)
  const [choices, setChoices] = useState<Record<ChosenAward, Choice>>({
    mvp: { decision: 'admin_direct', winner: null, nominees: [] },
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
  const bestKeepers = getBestGoalkeepers(stats)

  const update = (type: ChosenAward, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [type]: { ...c[type], ...patch } }))
  const notEnoughNominees = CHOSEN_AWARDS.some(({ type }) =>
    choices[type].decision === 'vote' && choices[type].nominees.length < MIN_NOMINEES)

  const handleSave = async () => {
    if (!sessionId || notEnoughNominees || saving) return
    setSaving(true)
    setSaveFailed(false)
    const awards: Omit<SessionAward, 'id' | 'league_id' | 'session_id'>[] = []
    const votes: { award_type: ChosenAward; vote_token: string; nominees: string[] }[] = []

    if (bestScorer.winner) {
      awards.push({ award_type: 'best_goalscorer', winner_player_id: bestScorer.winner.player.id, decided_by: 'auto_stat', is_tied: bestScorer.tied })
    }
    if (bestAssister.winner) {
      awards.push({ award_type: 'best_assister', winner_player_id: bestAssister.winner.player.id, decided_by: 'auto_stat', is_tied: bestAssister.tied })
    }
    // Keepers still level after goals per match share the award: one row each
    for (const k of bestKeepers) {
      awards.push({ award_type: 'best_goalkeeper', winner_player_id: k.player.id, decided_by: 'auto_stat', is_tied: bestKeepers.length > 1 })
    }

    for (const { type } of CHOSEN_AWARDS) {
      const choice = choices[type]
      if (choice.decision === 'admin_direct') {
        if (choice.winner) {
          awards.push({ award_type: type, winner_player_id: choice.winner, decided_by: 'admin_direct', is_tied: false })
        }
        continue
      }
      votes.push({ award_type: type, vote_token: crypto.randomUUID().replace(/-/g, '').slice(0, 12), nominees: choice.nominees })
    }

    // The votes, their nominees, the awards and closing the session are saved together or not at
    // all (public.finish_awards). A session finished already returns the votes it opened, so a
    // second tap shows the same links.
    const { data, error } = await supabase.rpc('finish_awards', { p_session_id: sessionId, p_awards: awards, p_votes: votes })
    setSaving(false)
    if (error) { setSaveFailed(true); return }
    const order = CHOSEN_AWARDS.map((a) => a.type as string)
    const opened = ((data ?? []) as { award_type: string; vote_token: string }[])
      .sort((a, b) => order.indexOf(a.award_type) - order.indexOf(b.award_type))
      .map((v): CreatedVote => ({ awardType: v.award_type, token: v.vote_token }))
    if (opened.length > 0) setCreatedVotes(opened)
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
        <AwardRow
          label={t('awards.bestGk')}
          winner={bestKeepers.length ? `${bestKeepers.map((k) => k.player.name).join(', ')} · ${t('awards.goalsConceded', { conceded: bestKeepers[0].goalsConceded, matches: bestKeepers[0].matchesPlayed })}` : undefined}
          tied={bestKeepers.length > 1}
          tiedLabel={t('awards.tied')}
        />
      </section>

      <SessionTopPlayers players={players} events={events} matches={matches} />

      {CHOSEN_AWARDS.map(({ type, labelKey }) => (
        <AwardChoiceSection
          key={type}
          title={t(labelKey)}
          choice={choices[type]}
          voting={voting}
          players={players}
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
      {saveFailed && <p role="alert" className="text-sm text-orange-300">{t('awards.finishFailed')}</p>}
    </div>
  )
}

function AwardChoiceSection({ title, choice, players, voting, onChange }: {
  title: string
  voting: boolean
  choice: Choice
  players: Player[]
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
