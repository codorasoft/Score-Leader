import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { youtubeEmbedUrl, youtubeThumbnail, youtubeWatchUrl } from '../utils/youtube'

interface Props {
  youtubeId: string
  title: string
  // The page decides which one video plays, so starting another stops this one
  playing: boolean
  onPlay: () => void
}

// A YouTube video: its thumbnail until it is tapped, then the player in the same place. Nothing
// is loaded from YouTube's player before the tap, so a long list stays light on a phone.
export default function TrainingVideo({ youtubeId, title, playing, onPlay }: Props) {
  const { t } = useTranslation()
  const [noThumbnail, setNoThumbnail] = useState(false)

  return (
    <div>
      <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-800">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(youtubeId)}
            title={title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube refuses embeds that send no referrer
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label={t('training.play', { title })}
            className="absolute inset-0 w-full h-full flex items-center justify-center group"
          >
            {!noThumbnail && (
              <img
                src={youtubeThumbnail(youtubeId)}
                alt=""
                loading="lazy"
                onError={() => setNoThumbnail(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <span aria-hidden="true" className="relative w-14 h-14 rounded-full bg-black/70 group-hover:bg-red-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </button>
        )}
      </div>
      {/* The way out when the owner blocked embedding, or the video was removed or made private */}
      <a
        href={youtubeWatchUrl(youtubeId)}
        target="_blank"
        rel="noreferrer"
        className="inline-block mt-1 text-xs text-blue-400 hover:underline"
      >
        {t('training.openOnYouTube')}
      </a>
    </div>
  )
}
