import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface CreatedVote {
  awardType: string
  token: string
}

export const voteUrl = (token: string) => `${window.location.origin}/s/vote/${token}`

export function ShareVoteButtons({ title, token }: { title: string; token: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const url = voteUrl(token)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked; the link is visible to copy by hand */ }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 break-all font-mono" dir="ltr">{url}</p>
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">
          {copied ? t('awards.copied') : t('awards.copyLink')}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm font-semibold text-center"
        >
          {t('awards.shareWhatsApp')}
        </a>
      </div>
    </div>
  )
}

export function VoteLinks({ votes, onDone }: { votes: CreatedVote[]; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">🗳️ {t('awards.votesReady')}</h1>
      <p className="text-sm text-gray-400">{t('awards.votesReadyBody')}</p>
      {votes.map((v) => {
        const title = t(`vote.awardType.${v.awardType}`)
        return (
          <section key={v.token} className="bg-gray-800 rounded-xl p-4 space-y-2">
            <h2 className="font-semibold">{title}</h2>
            <ShareVoteButtons title={title} token={v.token} />
          </section>
        )
      })}
      <button onClick={onDone} className="w-full py-3 bg-blue-600 rounded-xl font-bold">{t('awards.done')}</button>
    </div>
  )
}
