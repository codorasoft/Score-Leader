import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriteResult } from '../lib/trainingApi'
import { parseYouTubeId, youtubeThumbnail, youtubeWatchUrl } from '../utils/youtube'

interface Props {
  // The form's accessible name, and the text of its submit button
  label: string
  submitLabel: string
  // The video being edited; without it the form adds a new one and clears itself afterwards
  initial?: { title: string; youtube_id: string }
  busy: boolean
  onSubmit: (video: { title: string; youtube_id: string }) => Promise<WriteResult>
  onCancel?: () => void
}

// A catalog video's link and title. The link is checked as it is typed, and only the video's
// id leaves the form.
export default function TrainingVideoForm({ label, submitLabel, initial, busy, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const [link, setLink] = useState(initial ? youtubeWatchUrl(initial.youtube_id) : '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [duplicate, setDuplicate] = useState(false)

  const youtubeId = parseYouTubeId(link)
  const badLink = link.trim() !== '' && !youtubeId

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!youtubeId || !title.trim() || busy) return
    setDuplicate(false)
    const outcome = await onSubmit({ title, youtube_id: youtubeId })
    if (outcome === 'duplicate') setDuplicate(true)
    if (outcome === 'ok' && !initial) {
      setLink('')
      setTitle('')
    }
  }

  const field = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700'
  return (
    <form onSubmit={submit} aria-label={label} className="space-y-2">
      <input
        value={link}
        onChange={(e) => { setLink(e.target.value); setDuplicate(false) }}
        aria-label={t('super.training.link')}
        placeholder={t('super.training.link')}
        inputMode="url"
        dir="ltr"
        className={field}
      />
      {badLink && <p className="text-sm text-red-400">{t('super.training.badLink')}</p>}
      {youtubeId && (
        <img src={youtubeThumbnail(youtubeId)} alt="" className="w-40 aspect-video object-cover rounded-lg bg-gray-800" />
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        aria-label={t('super.training.videoTitle')}
        placeholder={t('super.training.videoTitle')}
        className={field}
      />
      {duplicate && <p className="text-sm text-red-400">{t('super.training.duplicate')}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !youtubeId || !title.trim()} className="px-4 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 disabled:opacity-50">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 rounded-lg font-semibold">{t('common.cancel')}</button>
        )}
      </div>
    </form>
  )
}
