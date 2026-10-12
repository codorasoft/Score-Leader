import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BOARD_TEXT_MAX, DRAW_COLORS, type DrawColor } from '../utils/boardDrawings'

interface Props {
  // The colour chosen in the toolbar; the text is typed and placed in it
  color: DrawColor
  onAdd: (text: string) => void
  onClose: () => void
}

// Asks what a new text on the coach board should say. Tapping outside cancels.
export default function BoardTextDialog({ color, onAdd, onClose }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('board.textTitle')}
        className="bg-gray-800 rounded-xl p-4 w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAdd(text) }}
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
          style={{ color: DRAW_COLORS[color] }}
        />
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
          <button type="submit" disabled={!text.trim()} className="flex-1 py-2 bg-blue-600 rounded font-semibold disabled:opacity-50">{t('board.addText')}</button>
        </div>
      </form>
    </div>
  )
}
