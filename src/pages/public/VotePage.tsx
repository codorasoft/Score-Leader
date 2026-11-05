import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getVoterId } from '../../utils/voterId'
import { useFeature } from '../../contexts/LeagueContext'
import { serverErrorKey } from '../../lib/errorText'
import type { AwardVote, Player } from '../../lib/types'
import PageSkeleton from '../../components/PageSkeleton'
import LoadFailed from '../../components/LoadFailed'

export default function VotePage() {
  const { voteToken } = useParams<{ voteToken: string }>()
  return <VoteBallot key={voteToken} voteToken={voteToken} />
}

function VoteBallot({ voteToken }: { voteToken: string | undefined }) {
  const { t } = useTranslation()
  const votingOn = useFeature('voting')
  const [vote, setVote] = useState<AwardVote | null>(null)
  const [nominees, setNominees] = useState<Player[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    setVote(null)
    setNominees([])
    setChosen(null)
    setSubmitted(false)
    setAlreadyVoted(false)
    setSendError('')
    const init = async () => {
      const fp = getVoterId()

      const { data: voteData, error: voteError } = await supabase
        .from('award_votes').select('*').eq('vote_token', voteToken).maybeSingle()
      if (cancelled) return
      if (voteError) throw voteError

      if (!voteData) return
      setVote(voteData as AwardVote)
      if (voteData.status === 'closed' || !votingOn) return

      const { data: existing, error: existingError } = await supabase
        .from('award_vote_entries')
        .select('id')
        .eq('award_vote_id', (voteData as AwardVote).id)
        .eq('voter_fingerprint', fp)
        .maybeSingle()
      if (cancelled) return
      if (existingError) throw existingError

      if (existing) { setAlreadyVoted(true); return }

      const { data: nomData, error: nomError } = await supabase
        .from('award_vote_nominations')
        .select('player_id')
        .eq('award_vote_id', (voteData as AwardVote).id)
      if (cancelled) return
      if (nomError) throw nomError

      const pIds = (nomData ?? []).map((n: { player_id: string }) => n.player_id)
      if (pIds.length > 0) {
        const { data: pData, error: playerError } = await supabase.from('players').select('*').in('id', pIds)
        if (cancelled) return
        if (playerError) throw playerError
        setNominees((pData ?? []) as Player[])
      }
    }
    void init().catch(() => {
      if (!cancelled) setLoadFailed(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [voteToken, votingOn, attempt])

  const handleSubmit = async () => {
    if (!chosen || !vote || sending) return
    setSending(true)
    setSendError('')
    try {
      const fp = getVoterId()
      const { error } = await supabase.from('award_vote_entries').insert({
        award_vote_id: vote.id,
        voter_fingerprint: fp,
        player_id: chosen,
      })
      // The voting rule refused it: the vote was closed (or voting switched off) after the page loaded
      if (error?.code === '42501') { setVote({ ...vote, status: 'closed' }); return }
      // A duplicate means this device's vote is already in; anything else was not saved, so keep the choice for a retry
      if (error && error.code !== '23505') { setSendError(t(serverErrorKey(error.message))); return }
      setSubmitted(true)
    } catch {
      setSendError(t(serverErrorKey(undefined)))
    } finally {
      setSending(false)
    }
  }

  if (loading) return <PageSkeleton />
  if (loadFailed) return <LoadFailed onRetry={() => setAttempt((value) => value + 1)} />
  if (!vote) return <div className="p-4 text-red-400 text-center">{t('vote.notFound')}</div>
  if (vote.status === 'closed' || !votingOn) return <div className="p-4 text-center"><p className="text-gray-400">{t('vote.closed')}</p></div>
  if (alreadyVoted || submitted) return (
    <div className="p-4 text-center">
      <div className="text-4xl mb-3">✓</div>
      <p className="text-gray-300">{t('vote.recorded')}</p>
    </div>
  )

  const awardLabel = t(`vote.awardType.${vote.award_type}` as const, { defaultValue: vote.award_type })

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">{awardLabel}</h1>
      <p className="text-sm text-gray-400 mb-4">{t('vote.selectOne')}</p>

      <div className="space-y-2 mb-6">
        {nominees.map((p) => (
          <button key={p.id} onClick={() => setChosen(p.id)}
            className={`w-full px-4 py-3 rounded-lg text-left font-semibold ${
              chosen === p.id ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}>
            {p.name}
          </button>
        ))}
      </div>

      {sendError && <p role="alert" className="text-red-400 text-sm text-center mb-3">{sendError}</p>}

      <button
        onClick={handleSubmit}
        disabled={!chosen || sending}
        className="w-full py-3 bg-blue-600 rounded-xl font-bold disabled:opacity-50"
      >
        {t('vote.submit')}
      </button>
    </div>
  )
}
