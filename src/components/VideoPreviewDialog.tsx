import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { youtubeEmbedUrl, youtubeWatchUrl } from '../utils/youtube'

interface Props {
  video: { youtube_id: string; title: string }
  // The video's training type, shown above its title
  typeName?: string
  // Its place in the plan (1 is first), or null when it is not picked
  position: number | null
  onToggle: () => void
  // Missing at either end of the list
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
}

// A catalog video played inside the app, so the admin can watch it before picking it. Picking
// keeps the dialog open, and the arrows step through the catalog, so several can be watched and
// picked in a row. Tapping outside, Escape and the close button all close it.
export default function VideoPreviewDialog({ video, typeName, position, onToggle, onPrev, onNext, onClose }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const picked = position !== null

  useEffect(() => { pickRef.current?.focus() }, [])

  // The page behind does not scroll while the video is open
  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [])

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !boxRef.current) return
    const focusable = [...boxRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const step = 'w-11 h-11 shrink-0 rounded-full bg-gray-700 hover:bg-gray-600 text-2xl leading-none flex items-center justify-center disabled:opacity-30 disabled:hover:bg-gray-700'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1 min-w-0">
            {typeName && <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">{typeName}</p>}
            <h2 id={titleId} className="text-lg font-bold leading-snug">{video.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('training.close')}
            className="w-9 h-9 shrink-0 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Keyed on the video, so stepping to another one starts a fresh player */}
        <div className="relative aspect-video bg-black">
          <iframe
            key={video.youtube_id}
            src={youtubeEmbedUrl(video.youtube_id)}
            title={video.title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube refuses embeds that send no referrer
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-center gap-3">
            {/* ‹ and › turn round by themselves in Arabic */}
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label={t('training.prevVideo')} className={step}>
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              ref={pickRef}
              onClick={onToggle}
              aria-pressed={picked}
              className={`flex-1 min-w-0 h-11 rounded-full font-semibold flex items-center justify-center gap-2 transition-colors ${
                picked ? 'bg-green-600/20 text-green-300 border border-green-500 hover:bg-green-600/30' : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {picked ? (
                <>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                  <span className="truncate">{t('training.pickedAt', { position })}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="text-xl leading-none">+</span>
                  <span className="truncate">{t('training.pickThis')}</span>
                </>
              )}
            </button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label={t('training.nextVideo')} className={step}>
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-gray-400">{picked ? t('training.tapToRemove') : t('training.previewHint')}</span>
            {/* The way out when the owner blocked embedding, or the video was removed or made private */}
            <a href={youtubeWatchUrl(video.youtube_id)} target="_blank" rel="noreferrer" className="shrink-0 text-blue-400 hover:underline">
              {t('training.openOnYouTube')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
