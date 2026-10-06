import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { recomputeResult } from '../../utils/matchEdit'
import { eventClockSeconds, formatMatchClock } from '../../utils/matchClock'
import { GoalDialog } from '../../components/GoalDialog'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { SessionVotes } from '../../components/SessionVotes'
import { SessionSummaryShare } from '../../components/SessionSummaryShare'
import LoadFailed from '../../components/LoadFailed'
import { buildSummaryParts } from '../../utils/sessionSummary'
import type { Match, Team, Session, MatchEvent, Player, TeamPlayer, SessionAward } from '../../lib/types'

const colorDot: Record<string, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-400',
}

const isGoal = (e: MatchEvent) => e.event_type === 'goal' || e.event_type === 'penalty_goal'

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const league = useLeague()
  const navigate = useNavigate()
  const summaryShare = useFeature('summary_share')
  const voting = useFeature('voting')
  const awardsOn = useFeature('awards')
  const [session, setSession] = useState<Session | null>(null)
  const [awards, setAwards] = useState<SessionAward[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [timelineId, setTimelineId] = useState<string | null>(null)
  const [goalDialog, setGoalDialog] = useState<{ match: Match; teamId: string } | null>(null)
  const [confirmDeleteMatchId, setConfirmDeleteMatchId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = async () => {
    const [sessRes, matchRes, teamRes, awardRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).eq('league_id', league.id).maybeSingle(),
      supabase.from('matches').select('*').eq('session_id', sessionId).order('match_number'),
      supabase.from('teams').select('*').eq('session_id', sessionId),
      supabase.from('session_awards').select('*').eq('session_id', sessionId),
    ])
    // A malformed id in the URL (invalid uuid) is "not found", not a failure.
    if (sessRes.error?.code === '22P02') { navigate(adminPath('/history'), { replace: true }); return }
    // A network or server failure is not "not found": offer a retry instead of leaving the page.
    if (sessRes.error || matchRes.error || teamRes.error || awardRes.error) { setLoadFailed(true); return }
    setLoadFailed(false)
    // Not found, or another league's session
    if (!sessRes.data) { navigate(adminPath('/history'), { replace: true }); return }
    setAwards((awardRes.data ?? []) as SessionAward[])
    const matchRows = (matchRes.data ?? []) as Match[]
    const teamRows = (teamRes.data ?? []) as Team[]
    setSession(sessRes.data as Session)
    setMatches(matchRows)
    setTeams(teamRows)

    if (matchRows.length === 0 || teamRows.length === 0) return
    const [{ data: evData, error: evError }, { data: tpData, error: tpError }] = await Promise.all([
      supabase.from('match_events').select('*').in('match_id', matchRows.map((m) => m.id)),
      supabase.from('team_players').select('*').in('team_id', teamRows.map((tm) => tm.id)),
    ])
    if (evError || tpError) { setLoadFailed(true); return }
    const evRows = (evData ?? []) as MatchEvent[]
    const tpRows = (tpData ?? []) as TeamPlayer[]
    setEvents(evRows)
    setTeamPlayers(tpRows)

    const pIds = [...new Set([...tpRows.map((tp) => tp.player_id), ...evRows.map((e) => e.player_id)])]
    if (pIds.length > 0) {
      const { data: pData, error: pError } = await supabase.from('players').select('*').in('id', pIds)
      if (pError) { setLoadFailed(true); return }
      setPlayers((pData ?? []) as Player[])
    }
  }

  useEffect(() => { load() }, [sessionId, league.id])

  const teamById = Object.fromEntries(teams.map((tm) => [tm.id, tm]))
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const teamLabel = (team: Team) => t('common.teamName', { color: t(`common.teamColor.${team.color}`) })
  const completed = matches.filter((m) => m.status === 'completed')
  const upcoming = matches.filter((m) => m.status !== 'completed')

  const runEdit = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
    load()
  }

  // Score is always derived from goal events so match results and player stats never disagree.
  const syncResult = async (match: Match) => {
    const { data } = await supabase.from('match_events').select('event_type, team_id').eq('match_id', match.id)
    if (!data) return
    await supabase.from('matches').update(recomputeResult(match, data as MatchEvent[])).eq('id', match.id)
  }

  const addGoal = (match: Match, teamId: string, scorerId: string, assisterId: string | null) =>
    runEdit(async () => {
      const { data: goal } = await supabase
        .from('match_events')
        .insert({ match_id: match.id, player_id: scorerId, team_id: teamId, event_type: 'goal' })
        .select().single()
      if (!goal) return
      if (assisterId) {
        await supabase.from('match_events').insert({
          match_id: match.id, player_id: assisterId, team_id: teamId,
          event_type: 'assist', related_event_id: (goal as MatchEvent).id,
        })
      }
      await syncResult(match)
    })

  const removeGoal = (match: Match, goal: MatchEvent) =>
    runEdit(async () => {
      const { error } = await supabase.from('match_events').delete().eq('related_event_id', goal.id)
      if (error) return
      await supabase.from('match_events').delete().eq('id', goal.id)
      await syncResult(match)
    })

  const setWinner = (match: Match, teamId: string) =>
    runEdit(async () => {
      await supabase.from('matches').update({ winner_team_id: teamId }).eq('id', match.id)
    })

  const deleteMatch = async (matchId: string) => {
    setConfirmDeleteMatchId(null)
    // match_events are removed by ON DELETE CASCADE
    await supabase.from('matches').delete().eq('id', matchId)
    load()
  }

  if (loadFailed) return <LoadFailed onRetry={load} />

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center gap-3 mb-5">
        <Link to={adminPath()} className="text-gray-400 hover:text-white text-sm">← {t('sessionDetail.back')}</Link>
        <h1 className="text-xl font-bold">{session?.date ?? '…'}</h1>
      </div>

      {summaryShare && session && completed.length > 0 && (
        <div className="mb-6">
          <SessionSummaryShare
            parts={buildSummaryParts({
              t, date: session.date, teams, players, matches, events, awards: awardsOn ? awards : [],
              url: `${window.location.origin}/s/${session.share_token}`,
            })}
          />
        </div>
      )}

      <div className="mb-6"><SessionStandings teams={teams} matches={matches} /></div>
      <div className="mb-6"><SessionTopPlayers players={players} events={events} matches={matches} /></div>
      {voting && sessionId && <div className="mb-6"><SessionVotes sessionId={sessionId} /></div>}

      {completed.length === 0 && (
        <p className="text-gray-500 text-center py-8">{t('sessionDetail.noMatches')}</p>
      )}

      <div className="space-y-3">
        {completed.map((m) => {
          const t1 = teamById[m.team1_id]
          const t2 = teamById[m.team2_id]
          const waiting = teamById[m.waiting_team_id]
          const winner = m.winner_team_id ? teamById[m.winner_team_id] : null
          const isEditing = editingId === m.id
          const matchEvents = events.filter((e) => e.match_id === m.id)

          return (
            <div key={m.id} className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-xs text-gray-400 font-mono pt-1">
                  {t('common.match', { number: m.match_number })}
                </span>
                <div className="flex items-center justify-end flex-wrap gap-2">
                  {winner && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
                      <span className={`w-2 h-2 rounded-full ${colorDot[winner.color] ?? 'bg-gray-400'}`} />
                      {teamLabel(winner)} {t('sessionDetail.wins')}
                    </span>
                  )}
                  {isEditing ? (
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-blue-600 rounded text-xs font-semibold hover:bg-blue-500">
                      {t('sessionDetail.done')}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setTimelineId(timelineId === m.id ? null : m.id)}
                        aria-expanded={timelineId === m.id}
                        className={`px-2 py-1 rounded text-xs ${timelineId === m.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                      >
                        {t('timeline.show')}
                      </button>
                      <button onClick={() => setEditingId(m.id)} className="px-2 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">
                        {t('sessionDetail.editMatch')}
                      </button>
                      <button onClick={() => setConfirmDeleteMatchId(m.id)} className="px-2 py-1 bg-red-900/60 rounded text-xs text-red-300 hover:bg-red-800">
                        {t('sessionDetail.deleteMatch')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <TeamChip team={t1} />
                <div className="flex-1 text-center font-mono font-bold text-lg tracking-widest">
                  {m.team1_score} – {m.team2_score}
                </div>
                <TeamChip team={t2} />
              </div>

              {isEditing && (
                <div className={`mt-4 space-y-4 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                  {[t1, t2].filter(Boolean).map((team) => {
                    const goals = matchEvents.filter((e) => isGoal(e) && e.team_id === team.id)
                    return (
                      <div key={team.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="flex items-center gap-2 text-xs uppercase font-semibold text-gray-400">
                            <span className={`w-2.5 h-2.5 rounded-full ${colorDot[team.color] ?? 'bg-gray-400'}`} />
                            {teamLabel(team)}
                          </span>
                          <button
                            onClick={() => setGoalDialog({ match: m, teamId: team.id })}
                            className="px-3 py-1 bg-green-700 rounded text-xs font-semibold hover:bg-green-600"
                          >
                            {t('sessionDetail.addGoal')}
                          </button>
                        </div>
                        {goals.length === 0 && <p className="text-xs text-gray-500 ps-4">{t('sessionDetail.noGoals')}</p>}
                        <div className="space-y-1 ps-4">
                          {goals.map((g) => {
                            const assist = matchEvents.find((e) => e.event_type === 'assist' && e.related_event_id === g.id)
                            return (
                              <div key={g.id} className="flex items-center justify-between bg-gray-700/60 rounded px-3 py-1.5 text-sm">
                                <span>
                                  {eventClockSeconds(g) != null && (
                                    <span className="font-mono text-xs text-gray-400 me-2" dir="ltr">{formatMatchClock(eventClockSeconds(g)!)}</span>
                                  )}
                                  ⚽ {playerName(g.player_id)}
                                  {assist && (
                                    <span className="text-xs text-gray-400 ms-2">
                                      {t('sessionDetail.assistBy', { name: playerName(assist.player_id) })}
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => removeGoal(m, g)}
                                  aria-label={t('common.remove')}
                                  className="w-7 h-7 rounded text-red-300 hover:bg-red-900/60"
                                >
                                  ✕
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {m.team1_score === m.team2_score && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">{t('sessionDetail.winner')}</p>
                      <div className="flex gap-2">
                        {[t1, t2].filter(Boolean).map((team) => (
                          <button
                            key={team.id}
                            onClick={() => setWinner(m, team.id)}
                            className={`flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-2 ${
                              m.winner_team_id === team.id ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${colorDot[team.color] ?? 'bg-gray-400'}`} />
                            {teamLabel(team)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">{t('sessionDetail.rotationNote')}</p>
                </div>
              )}

              {!isEditing && timelineId === m.id && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <MatchTimeline events={matchEvents} teams={teams} players={players} />
                </div>
              )}

              {!isEditing && waiting && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {t('common.waiting')}: {teamLabel(waiting)}
                </p>
              )}
              {!isEditing && m.is_draw && m.draw_resolved_by === 'penalties' && (
                <p className="text-xs text-blue-400 mt-1 text-center">{t('sessionDetail.resolvedPenalties')}</p>
              )}
            </div>
          )
        })}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs uppercase text-gray-500 mb-2">{t('sessionDetail.upcoming')}</h2>
          {upcoming.map((m) => (
            <div key={m.id} className="bg-gray-800/50 rounded-xl p-3 flex items-center gap-3 mb-2">
              <span className="text-xs text-gray-500 font-mono w-16">
                {t('common.match', { number: m.match_number })}
              </span>
              <TeamChip team={teamById[m.team1_id]} />
              <span className="text-gray-600 text-sm">{t('common.vs')}</span>
              <TeamChip team={teamById[m.team2_id]} />
              <button
                onClick={() => setConfirmDeleteMatchId(m.id)}
                className="ms-auto px-2 py-1 bg-red-900/60 rounded text-xs text-red-300 hover:bg-red-800"
              >
                {t('sessionDetail.deleteMatch')}
              </button>
            </div>
          ))}
        </div>
      )}

      {goalDialog && (
        <GoalDialog
          teams={[{
            team: teamById[goalDialog.teamId],
            players: teamPlayers
              .filter((tp) => tp.team_id === goalDialog.teamId)
              .map((tp) => players.find((p) => p.id === tp.player_id)!)
              .filter(Boolean),
          }]}
          onConfirm={({ scorerId, assisterId }) => {
            const { match, teamId } = goalDialog
            setGoalDialog(null)
            addGoal(match, teamId, scorerId, assisterId)
          }}
          onClose={() => setGoalDialog(null)}
        />
      )}

      {confirmDeleteMatchId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmDeleteMatchId(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-3">🗑️</div>
            <p className="text-sm text-gray-300 mb-5">{t('sessionDetail.confirmDeleteMatch')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteMatchId(null)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button onClick={() => deleteMatch(confirmDeleteMatchId)} className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500">
                {t('sessionDetail.deleteMatch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamChip({ team }: { team: Team | undefined }) {
  const { t } = useTranslation()
  if (!team) return <span className="flex-1 text-center text-gray-500 text-sm">?</span>
  return (
    <div className="flex-1 flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorDot[team.color] ?? 'bg-gray-400'}`} />
      <span className="text-sm font-semibold truncate">
        {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
      </span>
    </div>
  )
}
