import type { Player } from '../lib/types'
import { useFeature } from '../contexts/LeagueContext'

const SIZES = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-20 h-20 text-3xl' } as const

// Player photo, or their initial when there is none.
export function PlayerAvatar({ player, size = 'md' }: { player: Pick<Player, 'name' | 'photo_url'>; size?: keyof typeof SIZES }) {
  const photosOn = useFeature('photos')
  return player.photo_url && photosOn ? (
    <img src={player.photo_url} alt="" loading="lazy" className={`${SIZES[size]} rounded-full object-cover shrink-0 bg-gray-700`} />
  ) : (
    <span aria-hidden="true" className={`${SIZES[size]} rounded-full shrink-0 bg-gray-700 text-gray-300 font-bold flex items-center justify-center`}>
      {player.name.charAt(0).toUpperCase()}
    </span>
  )
}
