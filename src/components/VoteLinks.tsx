import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText, shareToMessenger } from '../lib/messengerShare'

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
    // If the clipboard is blocked the link is still visible to copy by hand
    if (await copyText(url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 break-all font-mono" dir="ltr">{url}</p>
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">
          {copied ? t('awards.copied') : t('awards.copyLink')}
        </button>
        <button
          onClick={() => shareToMessenger(`${title}: ${url}`)}
          className="flex-1 py-2 rounded-lg bg-[#0866FF] hover:bg-[#0756d6] text-sm font-semibold"
        >
          💬 {t('awards.shareMessenger')}
        </button>
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
