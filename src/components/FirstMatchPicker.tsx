import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamColor } from '../lib/types'
import { styleMap } from '../lib/teamColors'

const colorDot = styleMap('dot')

interface Props {
  // The session's teams, in colour order
  colors: TeamColor[]
  // The two teams that play the first match; null means pick two at random
  playing: [TeamColor, TeamColor] | null
  onChange: (playing: [TeamColor, TeamColor] | null) => void
}

// "Who plays first?": random, or tap two teams. The others wait in colour order.
export function FirstMatchPicker({ colors, playing, onChange }: Props) {
  const { t } = useTranslation()
  // First of the two teams, while the second is being chosen
  const [picking, onPicking] = useState<TeamColor | null>(null)
  const name = (c: TeamColor) => t('common.teamName', { color: t(`common.teamColor.${c}`) })
  const option = (selected: boolean) =>
    `min-h-[48px] rounded-lg px-3 py-2 text-start text-sm border flex items-center gap-2 ${
      selected ? 'border-blue-400 bg-blue-900/40' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
    }`

  const tap = (c: TeamColor) => {
    if (playing) { onChange(null); onPicking(c); return }
    if (picking === c) { onPicking(null); return }
    if (picking) { onChange([picking, c]); onPicking(null); return }
    onPicking(c)
  }
  const isChosen = (c: TeamColor) => (playing ? playing.includes(c) : picking === c)

  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold mb-1">{t('teamBuilder.firstMatchPick')}</legend>
      <p className="text-xs text-gray-400 mb-2">{t('teamBuilder.pickTwo')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button type="button" aria-pressed={!playing && !picking} onClick={() => { onChange(null); onPicking(null) }} className={option(!playing && !picking)}>
          🎲 {t('teamBuilder.firstMatchRandom')}
        </button>
        {colors.map((c) => (
          <button key={c} type="button" aria-pressed={isChosen(c)} onClick={() => tap(c)} className={option(isChosen(c))}>
            <span className={`w-2.5 h-2.5 rounded-full ${colorDot[c]}`} />
            {name(c)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
