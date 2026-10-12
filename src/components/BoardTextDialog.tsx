import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BOARD_TEXT_MAX, DRAW_COLORS, type DrawColor } from '../utils/boardDrawings'

interface Props {
  // The colour the dialog opens with: the toolbar's for a new text, its own for an existing one
  color: DrawColor
  // The words of the text being changed; without them the dialog adds a new text
  initialText?: string
  onSubmit: (text: string, color: DrawColor) => void
  // Only for an existing text: takes it off the board
  onRemove?: () => void
  onClose: () => void
}

// What a text on the coach board says and its colour: for a new text, or one that was tapped to
// change it. Tapping outside cancels.
export default function BoardTextDialog({ color, initialText, onSubmit, onRemove, onClose }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState(initialText ?? '')
  const [chosen, setChosen] = useState(color)
  const editing = initialText !== undefined

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('board.textTitle')}
        className="bg-gray-800 rounded-xl p-4 w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text, chosen) }}
      >
        <p className="font-bold mb-3">{t('board.textTitle')}</p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={BOARD_TEXT_MAX}
          autoFocus
          dir="auto"
          aria-label={t('board.textTitle')}
          placeholder={t('board.textPlaceholder')}
          // 16px text, so a phone does not zoom the page when the field opens
          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-base font-bold"
          style={{ color: DRAW_COLORS[chosen] }}
        />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-400">{t('board.colour')}</span>
          {(Object.keys(DRAW_COLORS) as DrawColor[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t(`board.colours.${c}`)}
              aria-pressed={chosen === c}
              onClick={() => setChosen(c)}
              className={`w-7 h-7 rounded-full border-2 ${chosen === c ? 'border-blue-400 ring-2 ring-blue-400/50' : 'border-gray-600'}`}
              style={{ background: DRAW_COLORS[c] }}
            />
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
          {onRemove && (
            <button type="button" onClick={onRemove} className="flex-1 py-2 rounded font-semibold text-red-300 bg-red-900/40 hover:bg-red-900/60">{t('common.remove')}</button>
          )}
          <button type="submit" disabled={!text.trim()} className="flex-1 py-2 bg-blue-600 rounded font-semibold disabled:opacity-50">
            {editing ? t('common.save') : t('board.addText')}
          </button>
        </div>
      </form>
    </div>
  )
}
