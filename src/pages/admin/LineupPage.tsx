import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { LineupPitch, TEAM_HEX, type PitchTeam } from '../../components/LineupPitch'
import { defaultFormation, toPitch, type Spot } from '../../utils/lineup'
import { drawLineupImage, shareCanvas } from '../../lib/shareImage'
import type { Match, Player, Session, Team, TeamColor, TeamPlayer } from '../../lib/types'

const COLORS: TeamColor[] = ['green', 'blue', 'yellow']
const key = (teamId: string, playerId: string) => `${teamId}|${playerId}`

export default function LineupPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [roster, setRoster] = useState<TeamPlayer[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [saved, setSaved] = useState<Map<string, Spot>>(new Map())
  const [pair, setPair] = useState<[string, string] | null>(null)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [{ data: sess }, { data: teamData }, { data: matchData }] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('teams').select('*').eq('session_id', sessionId),
        supabase.from('matches').select('*').eq('session_id', sessionId).order('match_number', { ascending: false }),
      ])
      const teamRows = ((teamData ?? []) as Team[]).sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color))
      setSession(sess as Session)
      setTeams(teamRows)
      if (teamRows.length < 2) return

      // Start with the match being played now (or next), else the first two teams
      const current = ((matchData ?? []) as Match[]).find((m) => m.status !== 'completed')
      setPair(current ? [current.team1_id, current.team2_id] : [teamRows[0].id, teamRows[1].id])

      const { data: tpData } = await supabase.from('team_players').select('*').in('team_id', teamRows.map((tm) => tm.id))
      const rows = (tpData ?? []) as TeamPlayer[]
      setRoster(rows)
      setSaved(new Map(rows.filter((r) => r.pos_x != null && r.pos_y != null)
        .map((r) => [key(r.team_id, r.player_id), { x: r.pos_x!, y: r.pos_y! }])))
      const ids = rows.map((r) => r.player_id)
      if (ids.length) {
        const { data: pData } = await supabase.from('players').select('*').in('id', ids)
        setPlayers((pData ?? []) as Player[])
      }
    }
    load()
  }, [sessionId])

  const teamName = (team: Team) => t('common.teamName', { color: t(`common.teamColor.${team.color}`) })
  const teamPlayers = (teamId: string) => roster
    .filter((r) => r.team_id === teamId)
    .map((r) => players.find((p) => p.id === r.player_id))
    .filter((p): p is Player => !!p)

  const pitchTeam = (teamId: string): PitchTeam => {
    const team = teams.find((tm) => tm.id === teamId)!
    const members = teamPlayers(teamId)
    const formation = defaultFormation(members)
    return {
      id: teamId,
      color: team.color,
      players: members.map((player) => ({ player, spot: saved.get(key(teamId, player.id)) ?? formation.get(player.id)! })),
    }
  }

  const move = async (teamId: string, playerId: string, spot: Spot) => {
    setSaved((m) => new Map(m).set(key(teamId, playerId), spot))
    await supabase.from('team_players').update({ pos_x: spot.x, pos_y: spot.y }).match({ team_id: teamId, player_id: playerId })
  }

  const reset = async (teamId: string) => {
    setSaved((m) => new Map([...m].filter(([k]) => !k.startsWith(`${teamId}|`))))
    await supabase.from('team_players').update({ pos_x: null, pos_y: null }).eq('team_id', teamId)
  }

  if (!session || !pair || players.length === 0) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const [bottomId, topId] = pair
  const bottom = pitchTeam(bottomId)
  const top = pitchTeam(topId)
  const waiting = teams.find((tm) => tm.id !== bottomId && tm.id !== topId)
  const pairings: [Team, Team][] = teams.flatMap((a, i) => teams.slice(i + 1).map((b) => [a, b] as [Team, Team]))

  const share = async () => {
    setSharing(true)
    const asImage = (pt: PitchTeam, side: 'top' | 'bottom') => {
      const team = teams.find((tm) => tm.id === pt.id)!
      return {
        name: teamName(team),
        hex: TEAM_HEX[team.color],
        players: pt.players.map(({ player, spot }) => ({ name: player.name, photo_url: player.photo_url, ...toPitch(spot, side) })),
      }
    }
    const bottomTeam = teams.find((tm) => tm.id === bottomId)!
    const topTeam = teams.find((tm) => tm.id === topId)!
    const canvas = await drawLineupImage({
      title: t('lineup.imageTitle', { team1: teamName(bottomTeam), team2: teamName(topTeam) }),
      subtitle: waiting
        ? `${session.date} · ${t('result.waits', { team: teamName(waiting) })}`
        : session.date,
      top: asImage(top, 'top'),
      bottom: asImage(bottom, 'bottom'),
      footer: `ScoreLeader · ${window.location.host}`,
    })
    await shareCanvas(canvas, 'scoreleader-lineup.png', t('lineup.title'))
    setSharing(false)
  }

  return (
    <div className="max-w-md mx-auto">
      <Link to={`/admin/sessions/${sessionId}`} className="text-gray-400 hover:text-white text-sm">← {t('sessionDetail.back')}</Link>
      <h1 className="text-xl font-bold mt-2">⚽ {t('lineup.title')}</h1>
      <p className="text-xs text-gray-400 mb-3">{t('lineup.help')}</p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {pairings.map(([a, b]) => {
          const active = (pair[0] === a.id && pair[1] === b.id) || (pair[0] === b.id && pair[1] === a.id)
          return (
            <button key={`${a.id}${b.id}`} onClick={() => setPair([a.id, b.id])} aria-pressed={active}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 ${active ? 'bg-blue-600' : 'bg-gray-800 text-gray-300'}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_HEX[a.color] }} />
              {t('lineup.vs', { team1: teamName(a), team2: teamName(b) })}
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_HEX[b.color] }} />
            </button>
          )
        })}
        <button onClick={() => setPair([topId, bottomId])} className="shrink-0 px-3 py-1.5 rounded-full text-sm bg-gray-800 text-gray-300" aria-label={t('lineup.flip')}>
          ↕ {t('lineup.flip')}
        </button>
      </div>

      <LineupPitch bottom={bottom} top={top} onMove={move} />

      {waiting && (
        <p className="text-xs text-gray-400 mt-2">
          <span className="inline-block w-2 h-2 rounded-full me-1.5" style={{ background: TEAM_HEX[waiting.color] }} />
          {t('lineup.waiting', { team: teamName(waiting), players: teamPlayers(waiting.id).map((p) => p.name).join(', ') })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        {[top, bottom].map((pt) => {
          const team = teams.find((tm) => tm.id === pt.id)!
          return (
            <button key={pt.id} onClick={() => reset(pt.id)} className="py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs">
              ↺ {t('lineup.reset', { team: teamName(team) })}
            </button>
          )
        })}
      </div>
      <button onClick={share} disabled={sharing} className="w-full mt-3 py-3 rounded-xl bg-[#0866FF] hover:bg-[#0756d6] font-semibold disabled:opacity-50">
        📤 {t('lineup.share')}
      </button>
    </div>
  )
}
