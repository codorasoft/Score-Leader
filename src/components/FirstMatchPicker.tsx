import { useTranslation } from 'react-i18next'
import type { TeamColor } from '../lib/types'

const COLORS: TeamColor[] = ['green', 'blue', 'yellow']
const colorDot: Record<string, string> = { green: 'bg-green-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400' }

interface Props {
  // The team that sits out the first match; null means decide by coin flip
  waiting: TeamColor | null
  onChange: (waiting: TeamColor | null) => void
}

export function FirstMatchPicker({ waiting, onChange }: Props) {
  const { t } = useTranslation()
  const name = (c: TeamColor) => t('common.teamName', { color: t(`common.teamColor.${c}`) })
  const option = (selected: boolean) =>
    `w-full min-h-[48px] rounded-lg px-3 py-2 text-start text-sm border ${
      selected ? 'border-blue-400 bg-blue-900/40' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
    }`

  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold mb-2">{t('teamBuilder.firstMatch')}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" aria-pressed={waiting === null} onClick={() => onChange(null)} className={option(waiting === null)}>
          🎲 {t('teamBuilder.firstMatchRandom')}
        </button>
        {COLORS.map((w) => {
          const [a, b] = COLORS.filter((c) => c !== w)
          return (
            <button key={w} type="button" aria-pressed={waiting === w} onClick={() => onChange(w)} className={option(waiting === w)}>
              <span className="flex items-center gap-1.5 font-semibold">
                <span className={`w-2.5 h-2.5 rounded-full ${colorDot[a]}`} />
                {t('teamBuilder.firstMatchPair', { team1: name(a), team2: name(b) })}
                <span className={`w-2.5 h-2.5 rounded-full ${colorDot[b]}`} />
              </span>
              <span className="block text-xs text-gray-400 mt-0.5">{t('teamBuilder.firstMatchWaits', { team: name(w) })}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
