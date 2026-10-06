import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Player, TeamColor } from '../lib/types'
import { PositionBadge } from '../pages/admin/PlayersPage'
import { movePlayer, swapPlayers, teamStars, type Teams } from '../utils/teamEdit'
import { styleMap } from '../lib/teamColors'

const colorStyles = styleMap('board')

interface Props {
  teams: Teams
  // Colour of each team, in the same order as `teams`
  colors: TeamColor[]
  onChange: (teams: Teams) => void
  // When given, team totals and player chips show this balancing strength instead of only stars
  strengthOf?: (p: Player) => number
}

// Tap a player to select them, then tap a player on another team to swap, or "Move here".
export function TeamSwapBoard({ teams, colors, onChange, strengthOf }: Props) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedTeam = selectedId ? teams.findIndex((team) => team.some((p) => p.id === selectedId)) : -1
  const selected = selectedTeam >= 0 ? teams[selectedTeam].find((p) => p.id === selectedId) : undefined

  const tapPlayer = (id: string, teamIdx: number) => {
    if (!selected || id === selectedId) return setSelectedId(id === selectedId ? null : id)
    if (teamIdx === selectedTeam) return setSelectedId(id)
    onChange(swapPlayers(teams, selected.id, id))
    setSelectedId(null)
  }

  const moveHere = (teamIdx: number) => {
    if (!selected) return
    onChange(movePlayer(teams, selected.id, teamIdx))
    setSelectedId(null)
  }

  return (
    <div>
      <p className={`text-sm mb-3 rounded-lg px-3 py-2 ${selected ? 'bg-blue-900/40 text-blue-200' : 'text-gray-400'}`} aria-live="polite">
        {selected ? t('teamBuilder.selectedHint', { name: selected.name }) : t('teamBuilder.swapHint')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {colors.map((color, idx) => {
          // Colours can arrive before the teams are (re)built
          const members = teams[idx] ?? []
          const isTarget = selected && idx !== selectedTeam
          return (
            <section key={color} className={`border rounded-xl p-3 ${colorStyles[color]}`}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-bold">{t('common.teamName', { color: t(`common.teamColor.${color}`) })}</h2>
                <span className="text-xs text-gray-300">
                  {strengthOf
                    ? t('teamBuilder.teamStrength', { count: members.length, power: members.reduce((n, p) => n + strengthOf(p), 0).toFixed(1) })
                    : t('teamBuilder.teamSummary', { count: members.length, stars: teamStars(members) })}
                </span>
              </div>

              <div className="space-y-2">
                {members.map((player) => {
                  const isSelected = player.id === selectedId
                  return (
                    <button
                      key={player.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => tapPlayer(player.id, idx)}
                      className={`w-full min-h-[44px] rounded-lg px-3 py-2 flex items-center gap-2 text-start transition-colors ${
                        isSelected
                          ? 'bg-blue-600 ring-2 ring-blue-300'
                          : isTarget ? 'bg-gray-700 hover:bg-gray-600 ring-1 ring-blue-400/50' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <PositionBadge position={player.position} />
                      <span className="text-sm flex-1 truncate">{player.name}</span>
                      <span className="text-xs text-yellow-400" aria-hidden="true">{'★'.repeat(player.skill_rating)}</span>
                      {strengthOf && <span className="text-xs text-gray-300 font-mono w-9 text-end">⚡{strengthOf(player).toFixed(1)}</span>}
                      {isTarget && <span className="text-blue-300" aria-hidden="true">⇄</span>}
                    </button>
                  )
                })}

                {isTarget && (
                  <button
                    type="button"
                    onClick={() => moveHere(idx)}
                    className="w-full min-h-[44px] rounded-lg border-2 border-dashed border-blue-400/60 text-sm text-blue-200 hover:bg-blue-900/30"
                  >
                    {t('teamBuilder.moveHere')}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
