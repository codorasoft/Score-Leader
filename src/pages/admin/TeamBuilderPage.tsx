import { useState, useEffect, useEffectEvent, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLeague, useFeature, useAdminPath } from '../../contexts/LeagueContext'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { balanceTeams } from '../../utils/teamBalancer'
import { blendStrength, formRatings, DEFAULT_FORM_SESSIONS } from '../../utils/playerForm'
import { partnerships, type Pair } from '../../utils/playerMatches'
import { TeamSwapBoard } from '../../components/TeamSwapBoard'
import { FirstMatchPicker } from '../../components/FirstMatchPicker'
import { matchRowFields, setupFirstMatch } from '../../utils/matchRotation'
import { labelSpotsForTeams, spotsForTeams } from '../../utils/board'
import { TEAM_COLORS } from '../../lib/teamColors'
import { draftOf, restoreDraft } from '../../utils/teamEdit'
import type { Match, MatchEvent, Player, Session, Team, TeamColor, TeamPlayer } from '../../lib/types'

const WEIGHT_KEY = 'balanceFormWeight'
const SPLIT_DUOS_KEY = 'balanceSplitDuos'
const DUO_MIN_MATCHES = 5
// A duo winning 80% together adds 0.6 strength to their team, so the balancer prefers to split them
const DUO_SCALE = 2

const readSplitDuos = () => {
  try { return localStorage.getItem(SPLIT_DUOS_KEY) !== 'false' } catch { return true }
}

const readWeight = () => {
  try {
    const raw = localStorage.getItem(WEIGHT_KEY)
    const v = Number(raw)
    return raw !== null && v >= 0 && v <= 100 ? v : 50
  } catch {
    return 50
  }
}

export default function TeamBuilderPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const league = useLeague()
  const smart = useFeature('smart_balancing')
  const coachBoard = useFeature('coach_board')
  const adminPath = useAdminPath()
  const [attendees, setAttendees] = useState<Player[]>([])
  const [form, setForm] = useState<Map<string, number>>(new Map())
  const [formPercent, setFormPercent] = useState(() => (smart ? readWeight() : 0))
  const [pairs, setPairs] = useState<Pair[]>([])
  const [splitDuos, setSplitDuos] = useState(readSplitDuos)
  // The session's number of teams (3 until it loads; sessions before this setting were all 3)
  const [teamCount, setTeamCount] = useState(3)
  const colors = TEAM_COLORS.slice(0, teamCount)
  const [teams, setTeams] = useState<Player[][]>([[], [], []])
  const [saving, setSaving] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [makingBoard, setMakingBoard] = useState(false)
  const [firstPlaying, setFirstPlaying] = useState<[TeamColor, TeamColor] | null>(null)
  const needsGk = attendees.length > 0 && attendees.filter((p) => p.position === 'GK').length < teamCount

  const strengthOf = useCallback(
    (p: Player) => blendStrength(p.skill_rating, form.get(p.id), formPercent / 100),
    [form, formPercent],
  )

  // Balanced teams for a stars/form mix and duo rule. Everything is passed in, so the teams can be
  // made while loading and as soon as a setting changes, before the page has drawn it.
  const balance = (list: Player[], count: number, formOf: Map<string, number>, duos: Pair[], percent: number, split: boolean) =>
    balanceTeams(
      list,
      count,
      (p) => blendStrength(p.skill_rating, formOf.get(p.id), percent / 100),
      (a, b) => {
        if (!smart || !split) return 0
        const pair = duos.find((p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id))
        if (!pair || pair.matches < DUO_MIN_MATCHES) return 0
        return Math.max(0, (pair.wins / pair.matches - 0.5) * DUO_SCALE)
      },
    ).teams

  // The arrangement is kept with the session so coming back, on any device, shows the same teams
  // instead of a new shuffle. Saves go out one after another, so the last change is the one kept.
  // A save that fails only means the next visit shuffles again.
  const saves = useRef<Promise<unknown>>(Promise.resolve())
  // Only for a session whose teams are not confirmed yet. Also off until the session shows it has
  // the column: the app can be deployed before the migration, and there every save would be
  // refused and shown as an error.
  const canSave = useRef(false)
  const saveDraft = (draft: string[][] | null) => {
    if (!canSave.current) return
    saves.current = saves.current.then(() => supabase.from('sessions').update({ draft_teams: draft }).eq('id', sessionId)).catch(() => {})
  }

  const arrange = (next: Player[][]) => {
    setTeams(next)
    saveDraft(draftOf(next))
  }

  const reshuffle = (percent = formPercent, split = splitDuos) => arrange(balance(attendees, teamCount, form, pairs, percent, split))

  // New teams for what just loaded, with the mix and duo rule as they are now; moving those
  // settings reshuffles by itself and must not load the session again
  const arrangeLoaded = useEffectEvent((list: Player[], count: number, formOf: Map<string, number>, duos: Pair[]) =>
    arrange(balance(list, count, formOf, duos, formPercent, splitDuos)))

  useEffect(() => {
    let stale = false
    const load = async () => {
      if (!sessionId) return
      const [{ data: sessionRow }, { data: spRows }] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).eq('league_id', league.id).maybeSingle(),
        supabase.from('session_players').select('player_id').eq('session_id', sessionId),
      ])
      // Not found, or another league's session
      if (stale || !sessionRow) return
      const { team_count: count, draft_teams: saved, date, status } = sessionRow as Session
      setSessionDate(date)
      canSave.current = status === 'draft' && 'draft_teams' in sessionRow
      setTeamCount(count)
      const playerIds = (spRows ?? []).map((r: { player_id: string }) => r.player_id)
      if (playerIds.length === 0) return
      let list: Player[]
      let formOf = new Map<string, number>()
      let duos: Pair[] = []
      if (!smart) {
        const { data: playerRows } = await supabase.from('players').select('*').in('id', playerIds)
        list = (playerRows ?? []) as Player[]
      } else {
        const [{ data: playerRows }, sessions, matches, events, teamPlayers] = await Promise.all([
          supabase.from('players').select('*').in('id', playerIds),
          selectAll<Session>((a, b) => supabase.from('sessions').select('*').eq('league_id', league.id).range(a, b)),
          selectAll<Match>((a, b) => supabase.from('matches').select('*').eq('league_id', league.id).eq('status', 'completed').range(a, b)),
          selectAll<MatchEvent>((a, b) => supabase.from('match_events').select('*').in('player_id', playerIds).range(a, b)),
          selectAll<TeamPlayer>((a, b) => supabase.from('team_players').select('*').in('player_id', playerIds).range(a, b)),
        ])
        list = (playerRows ?? []) as Player[]
        formOf = formRatings({ sessions, matches, events, teamPlayers }, DEFAULT_FORM_SESSIONS)
        duos = partnerships({ sessions, matches, events, teamPlayers })
      }
      if (stale) return
      setForm(formOf)
      setPairs(duos)
      setAttendees(list)
      if (list.length === 0) return
      // The teams from the last visit when they still fit who is attending; otherwise new ones
      const kept = restoreDraft(saved, list, count)
      if (kept) setTeams(kept)
      else arrangeLoaded(list, count, formOf, duos)
    }
    load()
    return () => { stale = true }
  }, [sessionId, league.id, smart])

  const changeSplitDuos = (value: boolean) => {
    setSplitDuos(value)
    try { localStorage.setItem(SPLIT_DUOS_KEY, String(value)) } catch { /* not remembered, still applied */ }
    reshuffle(formPercent, value)
  }

  const changeWeight = (value: number) => {
    setFormPercent(value)
    try { localStorage.setItem(WEIGHT_KEY, String(value)) } catch { /* not remembered, still applied */ }
    reshuffle(value, splitDuos)
  }

  const handleConfirm = async () => {
    if (!sessionId) return
    setSaving(true)

    const { data: teamRows } = await supabase
      .from('teams')
      .insert(colors.map((color) => ({ session_id: sessionId, color })))
      .select()
    if (!teamRows) { setSaving(false); return }

    // Match rows to board columns by colour; don't rely on the insert returning rows in order
    const teamPlayerRows = (teamRows as Team[]).flatMap((team) =>
      teams[colors.indexOf(team.color)].map((p) => ({ team_id: team.id, player_id: p.id }))
    )
    await supabase.from('team_players').insert(teamPlayerRows)

    await supabase.from('sessions').update({ status: 'active' }).eq('id', sessionId)
    // The confirmed teams are in teams / team_players now. Cleared on its own, after the session
    // has started, so that starting never depends on it.
    saveDraft(null)

    const created = teamRows as Team[]
    const idOf = (c: TeamColor) => created.find((tm) => tm.color === c)!.id
    const playing = firstPlaying ? [idOf(firstPlaying[0]), idOf(firstPlaying[1])] as [string, string] : undefined
    const first = setupFirstMatch(created, playing)
    const { data: matchData } = await supabase
      .from('matches')
      .insert({
        session_id: sessionId,
        match_number: 1,
        period: 1,
        ...matchRowFields(first),
        status: 'pending',
      })
      .select()
      .single()

    setSaving(false)
    if (matchData) {
      navigate(adminPath(`/sessions/${sessionId}/match/${(matchData as { id: string }).id}`))
    }
  }

  // A new coach board with every team on it, a row each in the order shown here, with the team's
  // name above its row. The teams are kept with the session, so leaving for the board is safe.
  const makeBoard = async () => {
    if (makingBoard) return
    setMakingBoard(true)
    const id = crypto.randomUUID()
    const name = t('teamBuilder.boardName', { date: sessionDate, teams: colors.map((c) => t(`common.teamColor.${c}`)).join(' / ') }).slice(0, 80)
    const rows = draftOf(teams)
    const labelSpots = labelSpotsForTeams(rows)
    const drawings = colors.flatMap((c, i) => (rows[i]?.length
      ? [{ id: crypto.randomUUID(), kind: 'label' as const, team: c, text: t('common.teamName', { color: t(`common.teamColor.${c}`) }), ...labelSpots[i] }]
      : []))
    const { error } = await supabase.from('lineups').insert({ id, league_id: league.id, name, drawings, guests: [] })
    if (!error) {
      const spots = spotsForTeams(rows).map((b) => ({ lineup_id: id, player_id: b.playerId, x: b.x, y: b.y }))
      const placed = await supabase.from('lineup_players').insert(spots)
      if (!placed.error) { navigate(adminPath(`/lineups/${id}`)); return }
      // No players on it: don't leave an empty board in the list
      await supabase.from('lineups').delete().eq('id', id)
    }
    setMakingBoard(false)
  }

  const mix = t('teamBuilder.balanceMix', { stars: 100 - formPercent, form: formPercent })

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h1 className="text-xl font-bold">{t('teamBuilder.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {coachBoard && (
            <button
              onClick={makeBoard}
              disabled={makingBoard || teams.every((team) => team.length === 0)}
              className="px-4 py-2 text-sm bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              <span aria-hidden="true">📋 </span>{t('teamBuilder.makeBoard')}
            </button>
          )}
          <button
            onClick={() => reshuffle()}
            className="px-4 py-2 text-sm bg-gray-700 rounded hover:bg-gray-600"
          >
            {t('teamBuilder.shuffleAll')}
          </button>
        </div>
      </div>

      {smart && (
      <section className="mb-4 bg-gray-800 rounded-xl p-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <label htmlFor="form-weight" className="font-semibold">{t('teamBuilder.balanceBy')}</label>
          <span className="text-xs text-gray-400">{mix}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-300">
          <span aria-hidden="true">⭐ {t('teamBuilder.stars')}</span>
          <input
            id="form-weight"
            type="range"
            min={0}
            max={100}
            step={10}
            value={formPercent}
            onChange={(e) => changeWeight(Number(e.target.value))}
            aria-valuetext={mix}
            className="flex-1 accent-blue-500"
          />
          <span aria-hidden="true">📈 {t('teamBuilder.form')}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">{t('teamBuilder.formHelp', { count: DEFAULT_FORM_SESSIONS })}</p>
        <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
          <input type="checkbox" checked={splitDuos} onChange={(e) => changeSplitDuos(e.target.checked)} className="w-4 h-4 accent-blue-500" />
          <span>🤝 {t('teamBuilder.splitDuos')}</span>
        </label>
      </section>
      )}

      {needsGk && (
        <div className="mb-4 p-3 bg-yellow-900/40 border border-yellow-600 rounded-lg text-sm text-yellow-300">
          ⚠ {t('teamBuilder.noGkWarning', { teams: teamCount })}
        </div>
      )}

      <TeamSwapBoard teams={teams} colors={colors} onChange={arrange} strengthOf={strengthOf} />

      {/* With two teams both always play, so there is nothing to choose */}
      {colors.length > 2 && <FirstMatchPicker colors={colors} playing={firstPlaying} onChange={setFirstPlaying} />}

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
