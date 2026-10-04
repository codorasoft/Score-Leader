import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { tallyVotes } from '../utils/awards'
import { ShareVoteButtons } from './VoteLinks'
import type { AwardVote, Player } from '../lib/types'

interface VoteData {
  vote: AwardVote
  nominees: string[]
  entries: { player_id: string }[]
}

// Lists a session's award votes with live counts; the admin closes each one to record the winner.
export function SessionVotes({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const [votes, setVotes] = useState<VoteData[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: voteRows } = await supabase.from('award_votes').select('*').eq('session_id', sessionId).order('created_at')
    const rows = (voteRows ?? []) as AwardVote[]
    if (rows.length === 0) { setVotes([]); return }
    const ids = rows.map((v) => v.id)
    const [{ data: noms }, { data: entries }] = await Promise.all([
      supabase.from('award_vote_nominations').select('award_vote_id, player_id').in('award_vote_id', ids),
      supabase.from('award_vote_entries').select('award_vote_id, player_id').in('award_vote_id', ids),
    ])
    const nomRows = (noms ?? []) as { award_vote_id: string; player_id: string }[]
    const entryRows = (entries ?? []) as { award_vote_id: string; player_id: string }[]
    setVotes(rows.map((vote) => ({
      vote,
      nominees: nomRows.filter((n) => n.award_vote_id === vote.id).map((n) => n.player_id),
      entries: entryRows.filter((e) => e.award_vote_id === vote.id),
    })))
    const pIds = [...new Set(nomRows.map((n) => n.player_id))]
    if (pIds.length > 0) {
      const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
      setPlayers((pData ?? []) as Player[])
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const closeVote = async (vote: AwardVote, winnerId: string, tied: boolean) => {
    setBusy(vote.id)
    const { error } = await supabase.from('session_awards').insert({
      session_id: sessionId, award_type: vote.award_type, winner_player_id: winnerId, decided_by: 'vote', is_tied: tied,
    })
    if (!error) {
      await supabase.from('award_votes').update({ status: 'closed', winner_player_id: winnerId }).eq('id', vote.id)
    }
    setBusy(null)
    load()
  }

  if (votes.length === 0) return null
  const name = (id: string | null) => players.find((p) => p.id === id)?.name ?? '?'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase text-gray-400">🗳️ {t('awards.votesTitle')}</h2>
        <button onClick={load} className="text-xs text-blue-300 hover:text-blue-200" aria-label="Refresh">↻</button>
      </div>
      {votes.map(({ vote, nominees, entries }) => {
        const title = t(`vote.awardType.${vote.award_type}`)
        const tally = tallyVotes(nominees, entries)
        const open = vote.status === 'open'
        return (
          <div key={vote.id} className={`bg-gray-800 rounded-xl p-4 space-y-3 ${busy === vote.id ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded ${open ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-300'}`}>
                {open ? t('awards.voteOpen') : t('awards.voteClosed')} · {t('awards.votesCount', { count: tally.total })}
              </span>
            </div>

            <ul className="space-y-1.5">
              {tally.rows.map((r) => (
                <li key={r.playerId} className="text-sm">
                  <div className="flex justify-between">
                    <span className={vote.winner_player_id === r.playerId ? 'font-bold text-green-400' : ''}>
                      {vote.winner_player_id === r.playerId && '🏆 '}{name(r.playerId)}
                    </span>
                    <span className="font-mono">{r.votes}</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded mt-1">
                    <div className="h-1.5 bg-blue-500 rounded" style={{ width: `${tally.total ? (r.votes / tally.total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            {open && (
              <>
                <ShareVoteButtons title={title} token={vote.vote_token} />
                {tally.leaders.length === 0 && <p className="text-xs text-gray-500">{t('awards.noVotesYet')}</p>}
                {tally.leaders.length === 1 && (
                  <button onClick={() => closeVote(vote, tally.leaders[0], false)} className="w-full py-2 rounded-lg bg-blue-600 font-semibold">
                    {t('awards.closeVote')} · {t('awards.winner', { name: name(tally.leaders[0]) })}
                  </button>
                )}
                {tally.leaders.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-yellow-300">{t('awards.tiePick')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {tally.leaders.map((pid) => (
                        <button key={pid} onClick={() => closeVote(vote, pid, true)} className="py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">
                          {name(pid)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {!open && vote.winner_player_id && (
              <p className="text-sm text-green-400">{t('awards.winner', { name: name(vote.winner_player_id) })}</p>
            )}
          </div>
        )
      })}
    </section>
  )
}
