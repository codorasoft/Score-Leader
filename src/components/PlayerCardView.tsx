import { useTranslation } from 'react-i18next'
import type { Player } from '../lib/types'
import type { PlayerCard } from '../utils/playerCard'

export const TIER_STYLE = {
  gold: { from: '#f9e08b', to: '#b8860b', ink: '#2b2002' },
  silver: { from: '#f3f4f6', to: '#9ca3af', ink: '#1f2937' },
  bronze: { from: '#f0b27a', to: '#8b5a2b', ink: '#2a1606' },
} as const

export function PlayerCardView({ player, card, size = 'md' }: { player: Player; card: PlayerCard; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const style = TIER_STYLE[card.tier]
  const small = size === 'sm'
  return (
    <div
      className={`relative rounded-2xl shadow-lg overflow-hidden ${small ? 'w-40 p-3' : 'w-64 p-5'}`}
      style={{ background: `linear-gradient(160deg, ${style.from}, ${style.to})`, color: style.ink }}
      aria-label={t('cards.aria', { name: player.name, overall: card.overall })}
      dir="ltr"
    >
      {card.isNew && (
        <span className={`absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 text-white font-bold ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}>
          {t('cards.new')}
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className="leading-none">
          <div className={`font-black ${small ? 'text-3xl' : 'text-5xl'}`}>{card.overall}</div>
          <div className={`font-bold mt-1 ${small ? 'text-xs' : 'text-sm'}`}>{player.position}</div>
        </div>
        {player.photo_url ? (
          <img src={player.photo_url} alt="" className={`rounded-full object-cover border-2 border-white/60 ${small ? 'w-12 h-12' : 'w-20 h-20'}`} />
        ) : (
          <div className={`rounded-full bg-black/15 flex items-center justify-center font-black ${small ? 'w-12 h-12 text-xl' : 'w-20 h-20 text-3xl'}`}>
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={`text-center font-extrabold truncate border-b border-black/20 ${small ? 'text-sm mt-2 pb-1' : 'text-lg mt-4 pb-2'}`}>
        {player.name}
      </div>
      <dl className={`grid grid-cols-2 gap-x-3 ${small ? 'text-[11px] mt-2 gap-y-0.5' : 'text-sm mt-3 gap-y-1'}`}>
        {card.attributes.map((a) => (
          <div key={a.key} className="flex justify-between">
            <dt className="font-semibold opacity-80">{a.key}</dt>
            <dd className="font-black">{a.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
