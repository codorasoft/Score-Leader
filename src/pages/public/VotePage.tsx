import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getFingerprint } from '../../utils/fingerprint'
import type { AwardVote, Player } from '../../lib/types'

export default function VotePage() {
  const { voteToken } = useParams<{ voteToken: string }>()
  const [vote, setVote] = useState<AwardVote | null>(null)
  const [nominees, setNominees] = useState<Player[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const fp = await getFingerprint()

      const { data: voteData } = await supabase
        .from('award_votes').select('*').eq('vote_token', voteToken).single()

      if (!voteData) { setLoading(false); return }
      setVote(voteData as AwardVote)

      const { data: existing } = await supabase
        .from('award_vote_entries')
        .select('id')
        .eq('award_vote_id', (voteData as AwardVote).id)
        .eq('voter_fingerprint', fp)
        .maybeSingle()

      if (existing) { setAlreadyVoted(true); setLoading(false); return }

      const { data: nomData } = await supabase
        .from('award_vote_nominations')
        .select('player_id')
        .eq('award_vote_id', (voteData as AwardVote).id)

      const pIds = (nomData ?? []).map((n: { player_id: string }) => n.player_id)
      if (pIds.length > 0) {
        const { data: pData } = await supabase.from('players').select('*').in('id', pIds)
        setNominees((pData ?? []) as Player[])
      }
      setLoading(false)
    }
    init()
  }, [voteToken])

  const handleSubmit = async () => {
    if (!chosen || !vote) return
    const fp = await getFingerprint()
    await supabase.from('award_vote_entries').insert({
      award_vote_id: vote.id,
      voter_fingerprint: fp,
      player_id: chosen,
    })
    setSubmitted(true)
  }

  if (loading) return <div className="p-4 text-gray-400 text-center">Loading…</div>
  if (!vote) return <div className="p-4 text-red-400 text-center">Vote not found</div>
  if (vote.status === 'closed') return <div className="p-4 text-center"><p className="text-gray-400">This vote is closed.</p></div>
  if (alreadyVoted || submitted) return (
    <div className="p-4 text-center">
      <div className="text-4xl mb-3">✓</div>
      <p className="text-gray-300">Your vote has been recorded.</p>
    </div>
  )

  const label: Record<string, string> = { mvp: 'MVP', fair_play: 'Well-Mannered Player' }

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">Vote: {label[vote.award_type] ?? vote.award_type}</h1>
      <p className="text-sm text-gray-400 mb-4">Select one player</p>

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

      <button
        onClick={handleSubmit}
        disabled={!chosen}
        className="w-full py-3 bg-blue-600 rounded-xl font-bold disabled:opacity-50"
      >
        Submit Vote
      </button>
    </div>
  )
}
