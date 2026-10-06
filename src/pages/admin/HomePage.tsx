import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { formatMatchClock } from '../../utils/matchClock'
import { liveState, matchElapsed, staleSessions, todoItems, type LiveState, type OpenVote, type TodoItem } from '../../utils/homeStatus'
import type { AwardVote, Match, Session, Team, TeamColor } from '../../lib/types'
import { styleMap } from '../../lib/teamColors'

const colorDot = styleMap('dot')
const AWARD_LABEL: Record<AwardVote['award_type'], string> = { mvp: 'awards.mvp', fair_play: 'awards.fairPlay', best_goalkeeper: 'awards.bestGk' }
const card = 'bg-gray-800 rounded-xl p-4'
const bigButton = 'min-h-[52px] rounded-xl font-bold text-base flex items-center justify-center gap-2 px-4'

interface Board { id: string; name: string; updated_at: string }
interface HomeData { live: LiveState; teams: Team[]; todo: TodoItem[]; board: Board | null }

const todayString = () => format(new Date(), 'yyyy-MM-dd')

export default function HomePage() {
  const { t } = useTranslation()
  const league = useLeague()
  const voting = useFeature('voting')
  const photos = useFeature('photos')
  const coachBoard = useFeature('coach_board')
  const [data, setData] = useState<{ leagueId: string; value: HomeData } | null>(null)

  // Latest league, so a slow response for a league we have left is dropped
  const currentLeague = useRef(league.id)
  currentLeague.current = league.id

  useEffect(() => {
    const forLeague = league.id
    const load = async () => {
      const { data: sessionRows } = await supabase.from('sessions').select('*').eq('league_id', forLeague).order('date', { ascending: false })
      const sessions = (sessionRows ?? []) as Session[]
      const openIds = sessions.filter((s) => s.status !== 'completed').map((s) => s.id)

      const [matchRes, teamRes, voteRes, photoRes, boardRes] = await Promise.all([
        openIds.length ? supabase.from('matches').select('*').in('session_id', openIds) : Promise.resolve({ data: [] }),
        openIds.length ? supabase.from('teams').select('*').in('session_id', openIds) : Promise.resolve({ data: [] }),
        voting ? supabase.from('award_votes').select('id, award_type, session_id').eq('league_id', forLeague).eq('status', 'open') : Promise.resolve({ data: [] }),
        photos
          ? supabase.from('players').select('id', { count: 'exact', head: true }).eq('league_id', forLeague).eq('is_active', true).is('photo_url', null)
          : Promise.resolve({ count: 0 }),
        coachBoard
          ? supabase.from('lineups').select('id, name, updated_at').eq('league_id', forLeague).order('updated_at', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] }),
      ])

      const openVotes = (voteRes.data ?? []) as { id: string; award_type: AwardVote['award_type']; session_id: string }[]
      const tally: Record<string, number> = {}
      if (openVotes.length) {
        const { data: entries } = await supabase.from('award_vote_entries').select('award_vote_id').in('award_vote_id', openVotes.map((v) => v.id))
        for (const e of (entries ?? []) as { award_vote_id: string }[]) tally[e.award_vote_id] = (tally[e.award_vote_id] ?? 0) + 1
      }
      if (forLeague !== currentLeague.current) return

      const dateOf = (id: string) => sessions.find((s) => s.id === id)?.date ?? ''
      const votes: OpenVote[] = openVotes.map((v) => ({ id: v.id, sessionId: v.session_id, sessionDate: dateOf(v.session_id), awardType: v.award_type, votes: tally[v.id] ?? 0 }))
      setData({
        leagueId: forLeague,
        value: {
          live: liveState(sessions, (matchRes.data ?? []) as Match[]),
          teams: (teamRes.data ?? []) as Team[],
          todo: todoItems({ votes, stale: staleSessions(sessions, todayString()), missingPhotos: photoRes.count ?? 0, voting, photos }),
          board: ((boardRes.data ?? []) as Board[])[0] ?? null,
        },
      })
    }
    load()
  }, [league.id, voting, photos, coachBoard])

  if (!data || data.leagueId !== league.id) return <div className="p-4 text-gray-400">{t('common.loading')}</div>
  const { live, teams, todo, board } = data.value

  return (
    <div className="flex flex-col gap-4">
      <LiveBlock live={live} teams={teams} />
      <TodoBlock items={todo} />
      {coachBoard && <BoardBlock board={board} />}
    </div>
  )
}

function useDateLabels() {
  const { i18n } = useTranslation()
  const locale = i18n.language === 'ar' ? ar : enUS
  const day = (date: string) => format(new Date(`${date}T00:00:00`), 'd MMM', { locale })
  const ago = (date: string) => {
    const days = Math.round((Date.parse(`${todayString()}T00:00:00`) - Date.parse(`${date}T00:00:00`)) / 86_400_000)
    return new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(-days, 'day')
  }
  return { day, ago }
}

function LiveBlock({ live, teams }: { live: LiveState; teams: Team[] }) {
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const { day, ago } = useDateLabels()

  if (live.kind === 'match') {
    const team = (id: string) => teams.find((x) => x.id === id)
    return (
      <section className={`${card} border border-green-700/60`} aria-label={t('home.liveNow')}>
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="flex items-center gap-2 font-semibold text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
            {t('home.liveNow')}
          </span>
          <span className="text-gray-400">{t('home.matchNumber', { n: live.match.match_number })}</span>
        </div>
        <div className="flex items-center justify-center gap-4 mb-1" dir="ltr">
          <TeamDot team={team(live.match.team1_id)} />
          <span className="text-3xl font-bold tabular-nums">{live.match.team1_score} – {live.match.team2_score}</span>
          <TeamDot team={team(live.match.team2_id)} />
        </div>
        <MatchClock match={live.match} />
        <Link to={adminPath(`/sessions/${live.session.id}/match/${live.match.id}`)} className={`${bigButton} mt-3 bg-green-600 hover:bg-green-500`}>
          <span aria-hidden="true">▶</span> {t('home.resume')}
        </Link>
      </section>
    )
  }

  if (live.kind === 'setup' || live.kind === 'open') {
    const to = live.kind === 'setup' ? `/sessions/${live.session.id}/teams` : `/sessions/${live.session.id}`
    return (
      <section className={card}>
        <p className="font-semibold mb-3">
          {t(live.kind === 'setup' ? 'home.setupTitle' : 'home.openTitle', { date: day(live.session.date) })}
        </p>
        <Link to={adminPath(to)} className={`${bigButton} bg-blue-600 hover:bg-blue-500`}>{t('home.continue')}</Link>
      </section>
    )
  }

  return (
    <section className={card}>
      <Link to={adminPath('/sessions/new')} className={`${bigButton} bg-blue-600 hover:bg-blue-500`}>
        <span aria-hidden="true">➕</span> {t('home.start')}
      </Link>
      <p className="text-sm text-gray-400 text-center mt-3">
        {live.lastPlayed ? t('home.lastPlayed', { when: ago(live.lastPlayed) }) : t('home.neverPlayed')}
      </p>
    </section>
  )
}

function TeamDot({ team }: { team: Team | undefined }) {
  const { t } = useTranslation()
  if (!team) return <span className="w-5 h-5 rounded-full bg-gray-600" aria-hidden="true" />
  return (
    <span className={`w-5 h-5 rounded-full ${colorDot[team.color] ?? 'bg-gray-500'}`}
      role="img" aria-label={t('common.teamName', { color: t(`common.teamColor.${team.color}`) })} />
  )
}

function MatchClock({ match }: { match: Match }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (match.timer_status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [match.timer_status])
  return <p className="text-center text-sm text-gray-300 tabular-nums" dir="ltr">{formatMatchClock(matchElapsed(match, now))}</p>
}

function TodoBlock({ items }: { items: TodoItem[] }) {
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const { day } = useDateLabels()
  const row = 'flex items-center gap-3 rounded-lg bg-gray-700/60 hover:bg-gray-700 px-3 py-3 text-sm'

  return (
    <section className={card}>
      <h2 className="font-bold mb-3">{t('home.todo')}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-green-400">{t('home.allDone')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.kind === 'vote' ? item.vote.id : item.kind === 'stale' ? item.session.id : 'photos'}>
              {item.kind === 'vote' && (
                <Link to={adminPath(`/sessions/${item.vote.sessionId}`)} className={row}>
                  <span aria-hidden="true">🗳️</span>
                  {t('home.todoVote', { award: t(AWARD_LABEL[item.vote.awardType]), date: day(item.vote.sessionDate), votes: t('awards.votesCount', { count: item.vote.votes }) })}
                </Link>
              )}
              {item.kind === 'stale' && (
                <Link to={adminPath(`/sessions/${item.session.id}`)} className={row}>
                  <span aria-hidden="true">⏱️</span>
                  {t('home.todoStale', { date: day(item.session.date) })}
                </Link>
              )}
              {item.kind === 'photos' && (
                <Link to={adminPath('/players')} className={row}>
                  <span aria-hidden="true">📷</span>
                  {t('home.todoPhotos', { count: item.count })}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function BoardBlock({ board }: { board: Board | null }) {
  const { t, i18n } = useTranslation()
  const adminPath = useAdminPath()
  const edited = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })

  return (
    <section className={card}>
      <h2 className="font-bold mb-3">{t('nav.lineup')}</h2>
      {board ? (
        <div className="flex items-center gap-2">
          <Link to={adminPath(`/lineups/${board.id}`)} className="flex-1 min-w-0 rounded-lg bg-gray-700/60 hover:bg-gray-700 px-3 py-3">
            <span className="block font-semibold truncate">{board.name}</span>
            <span className="block text-xs text-gray-400">{t('home.boardEdited', { date: edited(board.updated_at) })}</span>
          </Link>
          <Link to={adminPath('/lineups/new')} className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-3 text-sm font-semibold">
            {t('home.newBoard')}
          </Link>
        </div>
      ) : (
        <Link to={adminPath('/lineups/new')} className={`${bigButton} bg-gray-700 hover:bg-gray-600 text-sm`}>{t('home.firstBoard')}</Link>
      )}
    </section>
  )
}
