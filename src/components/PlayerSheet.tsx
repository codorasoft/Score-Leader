import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player, Team } from '../lib/types'
import { styleMap } from '../lib/teamColors'
import { PlayerAvatar } from './PlayerAvatar'

export interface TeamWithPlayers {
  team: Team
  players: Player[]
}

const colorDot = styleMap('dot')
const colorBoard = styleMap('board')

// A popup for the match screen: a sheet that rises from the bottom of a phone (where the thumb is)
// and sits centred on a wider screen. The title stays on top and Cancel at the bottom; only the
// middle scrolls.
export function MatchSheet({ title, onClose, children, footer }: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const titleId = useId()
  return (
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-gray-800 w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-3">
          <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-gray-600" aria-hidden="true" />
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4">{children}</div>
        <div className="px-4 pt-3 pb-4 flex gap-2">
          {footer}
          <button type="button" onClick={onClose} className="flex-1 min-h-[48px] rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// The playing teams side by side, each player a big button with their photo or initial, so the
// right one is found and tapped at a glance without scrolling through one long list.
export function TeamPlayerGrid({ teams, onPick, selectedId, extra }: {
  teams: TeamWithPlayers[]
  onPick: (playerId: string) => void
  selectedId?: string | null
  extra?: (player: Player) => ReactNode
}) {
  const { t } = useTranslation()
  const shown = teams.filter(({ players }) => players.length > 0)
  return (
    <div className={`grid gap-3 ${shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {shown.map(({ team, players }) => (
        <div key={team.id} className={`rounded-xl border-t-4 p-2 ${colorBoard[team.color] ?? 'border-gray-500'}`}>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot[team.color] ?? 'bg-gray-400'}`} aria-hidden="true" />
            <span className="text-xs uppercase font-semibold text-gray-300 tracking-wide truncate">
              {t('common.teamName', { color: t(`common.teamColor.${team.color}`) })}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                aria-pressed={selectedId === undefined ? undefined : selectedId === p.id}
                className={`w-full min-h-[52px] text-start px-2 py-1.5 rounded-lg flex items-center gap-2 ${
                  selectedId === p.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <PlayerAvatar player={p} size="sm" />
                <span className="flex-1 min-w-0 font-medium leading-tight line-clamp-2 break-words">{p.name}</span>
                {extra?.(p)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
