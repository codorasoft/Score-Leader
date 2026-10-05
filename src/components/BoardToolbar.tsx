import { useTranslation } from 'react-i18next'
import { DRAW_COLORS, type DrawColor, type DrawTool } from '../utils/boardDrawings'

const TOOLS: { tool: DrawTool; icon: string }[] = [
  { tool: 'move', icon: '✋' },
  { tool: 'pass', icon: '↗' },
  { tool: 'run', icon: '⤳' },
  { tool: 'zone', icon: '◯' },
  { tool: 'erase', icon: '🧽' },
]

interface Props {
  tool: DrawTool
  onTool: (tool: DrawTool) => void
  color: DrawColor
  onColor: (color: DrawColor) => void
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
}

export function BoardToolbar({ tool, onTool, color, onColor, canUndo, onUndo, onClear }: Props) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 bg-gray-800 rounded-xl p-2" role="toolbar" aria-label={t('board.tools')}>
      <div className="grid grid-cols-5 gap-1">
        {TOOLS.map(({ tool: value, icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={tool === value}
            onClick={() => onTool(value)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-lg text-[11px] font-semibold ${
              tool === value ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
            {t(`board.${value}`)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-2 px-1">
        <span className="text-xs text-gray-400">{t('board.colour')}</span>
        {(Object.keys(DRAW_COLORS) as DrawColor[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t(`board.colours.${c}`)}
            aria-pressed={color === c}
            onClick={() => onColor(c)}
            className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-blue-400 ring-2 ring-blue-400/50' : 'border-gray-600'}`}
            style={{ background: DRAW_COLORS[c] }}
          />
        ))}
        <span className="flex-1" />
        <button type="button" onClick={onUndo} disabled={!canUndo} className="px-2.5 py-1.5 rounded-lg bg-gray-700 text-xs font-semibold disabled:opacity-40">
          ↶ {t('board.undo')}
        </button>
        <button type="button" onClick={onClear} disabled={!canUndo} className="px-2.5 py-1.5 rounded-lg bg-gray-700 text-xs font-semibold text-red-300 disabled:opacity-40">
          🗑 {t('board.clear')}
        </button>
      </div>

      <p className="text-[11px] text-gray-400 mt-2 px-1">{t(`board.hint.${tool}`)}</p>
    </div>
  )
}
