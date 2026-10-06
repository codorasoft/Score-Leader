import { useState, useEffect, useCallback } from 'react'
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
import type { Match, MatchEvent, Player, Session, Team, TeamColor, TeamPlayer } from '../../lib/types'

const COLORS: TeamColor[] = ['green', 'blue', 'yellow']
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
  const adminPath = useAdminPath()
  const [attendees, setAttendees] = useState<Player[]>([])
  const [form, setForm] = useState<Map<string, number>>(new Map())
  const [formPercent, setFormPercent] = useState(() => (smart ? readWeight() : 0))
  const [pairs, setPairs] = useState<Pair[]>([])
  const [splitDuos, setSplitDuos] = useState(readSplitDuos)
  const [teams, setTeams] = useState<Player[][]>([[], [], []])
  const [needsGk, setNeedsGk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firstWaiting, setFirstWaiting] = useState<TeamColor | null>(null)

  const strengthOf = useCallback(
    (p: Player) => blendStrength(p.skill_rating, form.get(p.id), formPercent / 100),
    [form, formPercent],
  )

  const synergy = useCallback((a: Player, b: Player) => {
    if (!smart || !splitDuos) return 0
    const pair = pairs.find((p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id))
    if (!pair || pair.matches < DUO_MIN_MATCHES) return 0
    return Math.max(0, (pair.wins / pair.matches - 0.5) * DUO_SCALE)
  }, [pairs, splitDuos, smart])

  const rebalance = useCallback(() => {
    const result = balanceTeams(attendees, 3, strengthOf, synergy)
    setTeams(result.teams)
    setNeedsGk(result.needsGkAssignment)
  }, [attendees, strengthOf, synergy])

  useEffect(() => {
    const load = async () => {
      if (!sessionId) return
      const { data: spRows } = await supabase.from('session_players').select('player_id').eq('session_id', sessionId)
      const playerIds = (spRows ?? []).map((r: { player_id: string }) => r.player_id)
      if (playerIds.length === 0) return
      if (!smart) {
        const { data: playerRows } = await supabase.from('players').select('*').in('id', playerIds)
        setAttendees((playerRows ?? []) as Player[])
        return
      }
      const [{ data: playerRows }, sessions, matches, events, teamPlayers] = await Promise.all([
        supabase.from('players').select('*').in('id', playerIds),
        selectAll<Session>((a, b) => supabase.from('sessions').select('*').eq('league_id', league.id).range(a, b)),
        selectAll<Match>((a, b) => supabase.from('matches').select('*').eq('league_id', league.id).eq('status', 'completed').range(a, b)),
        selectAll<MatchEvent>((a, b) => supabase.from('match_events').select('*').in('player_id', playerIds).range(a, b)),
        selectAll<TeamPlayer>((a, b) => supabase.from('team_players').select('*').in('player_id', playerIds).range(a, b)),
      ])
      setForm(formRatings({ sessions, matches, events, teamPlayers }, DEFAULT_FORM_SESSIONS))
      setPairs(partnerships({ sessions, matches, events, teamPlayers }))
      setAttendees((playerRows ?? []) as Player[])
    }
    load()
  }, [sessionId, league.id, smart])

  // Rebalance when attendees and form arrive, and whenever the stars/form mix changes
  useEffect(() => { if (attendees.length > 0) rebalance() }, [rebalance, attendees.length])

  const changeSplitDuos = (value: boolean) => {
    setSplitDuos(value)
    try { localStorage.setItem(SPLIT_DUOS_KEY, String(value)) } catch { /* not remembered, still applied */ }
  }

  const changeWeight = (value: number) => {
    setFormPercent(value)
    try { localStorage.setItem(WEIGHT_KEY, String(value)) } catch { /* not remembered, still applied */ }
  }

  const handleConfirm = async () => {
    if (!sessionId) return
    setSaving(true)

    const { data: teamRows } = await supabase
      .from('teams')
      .insert(COLORS.map((color) => ({ session_id: sessionId, color })))
      .select()
    if (!teamRows) { setSaving(false); return }

    // Match rows to board columns by colour; don't rely on the insert returning rows in order
    const teamPlayerRows = (teamRows as Team[]).flatMap((team) =>
      teams[COLORS.indexOf(team.color)].map((p) => ({ team_id: team.id, player_id: p.id }))
    )
    await supabase.from('team_players').insert(teamPlayerRows)

    await supabase.from('sessions').update({ status: 'active' }).eq('id', sessionId)

    const created = teamRows as Team[]
    const playing = firstWaiting ? created.filter((tm) => tm.color !== firstWaiting).map((tm) => tm.id) as [string, string] : undefined
    const first = setupFirstMatch(created, playing)
    const { data: matchData } = await supabase
      .from('matches')
      .insert({
        session_id: sessionId,
        match_number: 1,
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

  const mix = t('teamBuilder.balanceMix', { stars: 100 - formPercent, form: formPercent })

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">{t('teamBuilder.title')}</h1>
        <button
          onClick={rebalance}
          className="px-4 py-2 text-sm bg-gray-700 rounded hover:bg-gray-600"
        >
          {t('teamBuilder.shuffleAll')}
        </button>
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
          ⚠ {t('teamBuilder.noGkWarning')}
        </div>
      )}

      <TeamSwapBoard teams={teams} onChange={setTeams} strengthOf={strengthOf} />

      <FirstMatchPicker waiting={firstWaiting} onChange={setFirstWaiting} />

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
