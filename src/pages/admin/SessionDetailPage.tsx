import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { fetchSession } from '../../lib/sessionData'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { recomputeResult } from '../../utils/matchEdit'
import { eventClockSeconds, formatMatchClock, MATCH_DURATION_SECONDS } from '../../utils/matchClock'
import { GoalDialog } from '../../components/GoalDialog'
import { MatchTimeline } from '../../components/MatchTimeline'
import { SessionStandings } from '../../components/SessionStandings'
import { SessionTopPlayers } from '../../components/SessionTopPlayers'
import { SessionVotes } from '../../components/SessionVotes'
import { SessionSummaryShare } from '../../components/SessionSummaryShare'
import LoadFailed from '../../components/LoadFailed'
import { FirstMatchPicker } from '../../components/FirstMatchPicker'
import { drawGoesToPenalties, matchRowFields, nextMatchToStart, waitingQueue } from '../../utils/matchRotation'
import { buildSummaryParts } from '../../utils/sessionSummary'
import type { Match, Team, TeamColor, Session, MatchEvent, Player, TeamPlayer, SessionAward } from '../../lib/types'
import { styleMap, TEAM_COLORS } from '../../lib/teamColors'
import { createTeamsBoard } from '../../lib/teamsBoard'
import { MatchFormatLine } from '../../components/MatchFormatLine'
import { DEFAULT_FORMAT, periodLength } from '../../utils/matchFormat'
import { resultLabel } from '../../utils/resultLabel'
import { sessionDate } from '../../utils/sessionDate'

const colorDot = styleMap('dot')

const isGoal = (e: MatchEvent) => e.event_type === 'goal' || e.event_type === 'penalty_goal'

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { t, i18n } = useTranslation()
  const adminPath = useAdminPath()
  const league = useLeague()
  const navigate = useNavigate()
  const summaryShare = useFeature('summary_share')
  const coachBoard = useFeature('coach_board')
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
  const [firstPlaying, setFirstPlaying] = useState<[TeamColor, TeamColor] | null>(null)
  const [starting, setStarting] = useState(false)
  const [hasPlayers, setHasPlayers] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenFailed, setReopenFailed] = useState(false)
  const [makingBoard, setMakingBoard] = useState(false)

  // The session with everything linked to it, and its awards, side by side in one round
  const load = useCallback(async () => {
    const [sessRes, awardRes] = await Promise.allSettled([
      fetchSession('id', sessionId ?? '', league.id),
      supabase.from('session_awards').select('*').eq('session_id', sessionId).then(({ data, error }) => {
        if (error) throw error
        return (data ?? []) as SessionAward[]
      }),
    ])
    // A malformed id in the URL (invalid uuid) is "not found", not a failure.
    if (sessRes.status === 'rejected' && sessRes.reason?.code === '22P02') { navigate(adminPath('/history'), { replace: true }); return }
    // A network or server failure is not "not found": offer a retry instead of leaving the page.
    if (sessRes.status === 'rejected' || awardRes.status === 'rejected') { setLoadFailed(true); return }
    setLoadFailed(false)
    // Not found, or another league's session
    const data = sessRes.value
    if (!data) { navigate(adminPath('/history'), { replace: true }); return }
    // A session without confirmed teams carries on at the team builder, or at picking players when nobody is picked yet
    if (data.session.status === 'draft') {
      const { data: picked } = await supabase.from('session_players').select('player_id').eq('session_id', sessionId).limit(1)
      setHasPlayers((picked ?? []).length > 0)
    }
    setAwards(awardRes.value)
    setSession(data.session)
    setMatches(data.matches)
    setTeams(data.teams)
    setEvents(data.events)
    setTeamPlayers(data.teamPlayers)
    setPlayers(data.players)
  }, [sessionId, league.id, navigate, adminPath])

  useEffect(() => { load() }, [load])

  const teamById = Object.fromEntries(teams.map((tm) => [tm.id, tm]))
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const teamLabel = (team: Team) => t('common.teamName', { color: t(`common.teamColor.${team.color}`) })
  const teamNameOf = (id: string | null) => (id && teamById[id] ? teamLabel(teamById[id]) : '?')
  const format = session ?? DEFAULT_FORMAT
  // A level match has a winner to pick unless the draw rule lets it stand (no shoot-out to settle it)
  const canPickWinner = (m: Match) => m.team1_score === m.team2_score
    && !(format.draw_rule === 'draw' && !drawGoesToPenalties(format, m.match_number))
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
    await supabase.from('matches').update(recomputeResult(match, data as MatchEvent[], format)).eq('id', match.id)
  }

  const addGoal = (match: Match, teamId: string, scorerId: string, assisterId: string | null) =>
    runEdit(async () => {
      const { data: goal } = await supabase
        .from('match_events')
        .insert({ match_id: match.id, period: match.period, player_id: scorerId, team_id: teamId, event_type: 'goal' })
        .select().single()
      if (!goal) return
      if (assisterId) {
        await supabase.from('match_events').insert({
          match_id: match.id, period: match.period, player_id: assisterId, team_id: teamId,
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

  // An under-way session with no match set up (all deleted, or the upcoming one deleted) can carry on from here
  const canStart = session?.status === 'active' && nextMatchToStart(matches, teams) !== null
  const startNumber = canStart ? nextMatchToStart(matches, teams)!.matchNumber : 0

  const startNextMatch = async () => {
    const idOf = (c: TeamColor) => teams.find((tm) => tm.color === c)?.id ?? ''
    const playing = firstPlaying ? [idOf(firstPlaying[0]), idOf(firstPlaying[1])] as [string, string] : undefined
    const next = nextMatchToStart(matches, teams, playing)
    if (!next || starting) return
    setStarting(true)
    const { data } = await supabase.from('matches').insert({
      session_id: sessionId,
      match_number: next.matchNumber,
      period: 1,
      ...matchRowFields(next),
      status: 'pending',
    }).select().single()
    setStarting(false)
    if (data) navigate(adminPath(`/sessions/${sessionId}/match/${(data as Match).id}`))
  }

  // Teams confirmed but nothing played yet (no match ended, no goal or card): the session can go
  // back to picking teams. The confirmed teams are kept as the draft, so the builder opens on them.
  const canReopen = session?.status === 'active' && completed.length === 0 && events.length === 0

  // The confirmed teams in colour order, as player ids per team
  const orderedTeams = [...teams].sort((a, b) => TEAM_COLORS.indexOf(a.color) - TEAM_COLORS.indexOf(b.color))
  const playerIdsOf = (team: Team) => teamPlayers.filter((tp) => tp.team_id === team.id).map((tp) => tp.player_id)

  // A coach board with the confirmed teams on it, as the team builder makes one, so the teams can
  // still be put on a board and shared once the session is under way or over
  const makeBoard = async () => {
    if (makingBoard || !session) return
    setMakingBoard(true)
    const name = t('teamBuilder.boardName', { date: session.date, teams: orderedTeams.map((tm) => t(`common.teamColor.${tm.color}`)).join(' / ') })
    const id = await createTeamsBoard(league.id, name, orderedTeams.map((tm) => ({ color: tm.color, label: teamLabel(tm), playerIds: playerIdsOf(tm) })))
    if (id) { navigate(adminPath(`/lineups/${id}`)); return }
    setMakingBoard(false)
  }

  const reopenTeams = async () => {
    if (reopening) return
    setReopening(true)
    setReopenFailed(false)
    const draft = orderedTeams.map(playerIdsOf)
    const { data, error } = await supabase.rpc('reopen_teams', { p_session_id: sessionId, p_draft_teams: draft })
    setReopening(false)
    setConfirmReopen(false)
    if (error || !data) { setReopenFailed(true); load(); return }
    navigate(adminPath(`/sessions/${sessionId}/teams`))
  }

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
        <h1 className="text-xl font-bold">{session ? sessionDate(session.date, i18n.language) : '…'}</h1>
      </div>
      {session && <MatchFormatLine format={session} />}

      {coachBoard && session?.status !== 'draft' && teams.length > 0 && (
        <button
          onClick={makeBoard}
          disabled={makingBoard}
          className="mb-6 w-full py-2 text-sm bg-gray-700 rounded-xl hover:bg-gray-600 disabled:opacity-50"
        >
          <span aria-hidden="true">📋 </span>{t('teamBuilder.makeBoard')}
        </button>
      )}

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

      {canStart && (
        <section className="mb-6 bg-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-300 mb-3">{t('sessionDetail.noMatchSetUp')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {teams.map((team) => (
              <div key={team.id} className="bg-gray-900/60 rounded-lg p-2">
                <TeamChip team={team} />
                <ul className="mt-1 ps-5 text-sm text-gray-300">
                  {teamPlayers.filter((tp) => tp.team_id === team.id).map((tp) => <li key={tp.player_id}>{playerName(tp.player_id)}</li>)}
                </ul>
              </div>
            ))}
          </div>
          {startNumber === 1 && teams.length > 2 && <FirstMatchPicker colors={teams.map((tm) => tm.color)} playing={firstPlaying} onChange={setFirstPlaying} />}
          <button
            onClick={startNextMatch}
            disabled={starting}
            className="mt-4 w-full py-3 bg-green-600 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
          >
            {t('sessionDetail.startMatch', { number: startNumber })}
          </button>
        </section>
      )}

      {session?.status === 'draft' && (
        <section className="mb-6 bg-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-300 mb-3">{t('sessionDetail.teamsNotConfirmed')}</p>
          <Link
            to={adminPath(`/sessions/${sessionId}/${hasPlayers ? 'teams' : 'players'}`)}
            className="block w-full py-3 bg-blue-600 rounded-xl font-bold text-center hover:bg-blue-500"
          >
            {t(hasPlayers ? 'sessionDetail.chooseTeams' : 'sessionDetail.choosePlayers')}
          </Link>
          {hasPlayers && (
            <Link
              to={adminPath(`/sessions/${sessionId}/players`)}
              className="mt-2 block w-full py-2 bg-gray-700 rounded-xl text-sm font-semibold text-center hover:bg-gray-600"
            >
              {t('sessionDetail.changePlayers')}
            </Link>
          )}
        </section>
      )}

      {canReopen && (
        <section className="mb-6 bg-gray-800 rounded-xl p-4">
          <p className="text-sm text-gray-300 mb-3">{t('sessionDetail.nothingPlayedYet')}</p>
          <button
            onClick={() => setConfirmReopen(true)}
            className="w-full py-3 bg-gray-700 rounded-xl font-bold hover:bg-gray-600"
          >
            {t('sessionDetail.backToTeams')}
          </button>
          {reopenFailed && <p role="alert" className="mt-2 text-sm text-orange-300">{t('sessionDetail.backToTeamsFailed')}</p>}
        </section>
      )}

      <div className="mb-6"><SessionStandings teams={teams} matches={matches} /></div>
      <div className="mb-6"><SessionTopPlayers players={players} events={events} matches={matches} /></div>
      {voting && sessionId && <div className="mb-6"><SessionVotes sessionId={sessionId} /></div>}

      {completed.length === 0 && session?.status !== 'draft' && (
        <p className="text-gray-500 text-center py-8">{t('sessionDetail.noMatches')}</p>
      )}

      <div className="space-y-3">
        {completed.map((m) => {
          const t1 = teamById[m.team1_id]
          const t2 = teamById[m.team2_id]
          // Everyone who sat out this match, in queue order
          const waiting = waitingQueue(m).map((id) => teamById[id]).filter(Boolean)
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
                  <span className={`flex items-center gap-1.5 text-xs font-semibold ${m.is_draw ? 'text-yellow-400' : 'text-green-400'}`}>
                    {winner && <span className={`w-2 h-2 rounded-full ${colorDot[winner.color] ?? 'bg-gray-400'}`} />}
                    {resultLabel(m, teamNameOf, t)}
                  </span>
                  {isEditing ? (
                    <button onClick={() => setEditingId(null)} className="min-h-[40px] px-4 bg-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-500">
                      {t('sessionDetail.done')}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setTimelineId(timelineId === m.id ? null : m.id)}
                        aria-expanded={timelineId === m.id}
                        className={`min-h-[40px] px-3 rounded-lg text-sm ${timelineId === m.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                      >
                        {t('timeline.show')}
                      </button>
                      <button onClick={() => setEditingId(m.id)} className="min-h-[40px] px-3 bg-gray-700 rounded-lg text-sm hover:bg-gray-600">
                        {t('sessionDetail.editMatch')}
                      </button>
                      <button onClick={() => setConfirmDeleteMatchId(m.id)} className="min-h-[40px] px-3 ms-3 border border-red-800/70 rounded-lg text-sm text-red-300 hover:bg-red-900/60">
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
                            className="min-h-[40px] px-4 bg-green-700 rounded-lg text-sm font-semibold hover:bg-green-600"
                          >
                            {t('sessionDetail.addGoal')}
                          </button>
                        </div>
                        {goals.length === 0 && <p className="text-xs text-gray-500 ps-4">{t('sessionDetail.noGoals')}</p>}
                        <div className="space-y-1 ps-4">
                          {goals.map((g) => {
                            const assist = matchEvents.find((e) => e.event_type === 'assist' && e.related_event_id === g.id)
                            return (
                              <div key={g.id} className="flex items-center justify-between gap-2 bg-gray-700/60 rounded-lg ps-3 pe-1 py-1 text-sm">
                                <span>
                                  {eventClockSeconds(g) != null && (
                                    <span className="font-mono text-xs text-gray-400 me-2" dir="ltr">{formatMatchClock(eventClockSeconds(g)!, periodLength(g.period, format) ?? MATCH_DURATION_SECONDS)}</span>
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
                                  className="w-10 h-10 shrink-0 rounded-lg text-red-300 hover:bg-red-900/60"
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

                  {canPickWinner(m) && (
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
                  <MatchTimeline events={matchEvents} teams={teams} players={players} format={session ?? undefined} />
                </div>
              )}

              {!isEditing && waiting.length > 0 && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {t('common.waiting')}: {waiting.map(teamLabel).join(t('common.listSeparator'))}
                </p>
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

      {confirmReopen && (
        <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmReopen(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-300 mb-5">{t('sessionDetail.confirmBackToTeams')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReopen(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button onClick={reopenTeams} disabled={reopening} className="flex-1 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-500 disabled:opacity-50">
                {t('sessionDetail.backToTeams')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteMatchId && (
        <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmDeleteMatchId(null)}>
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
