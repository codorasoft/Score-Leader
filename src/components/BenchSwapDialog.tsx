import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlayerPosition } from '../lib/types'
import { BenchDot, type BenchPerson } from './BenchColumn'

interface Props {
  substitute: BenchPerson
  // Everyone on the pitch; a guest has no position
  onPitch: (BenchPerson & { position: PlayerPosition | null })[]
  onSwap: (starterId: string) => void
  onPutOn: () => void
  onRemove: () => void
  onClose: () => void
}

// What to do with a substitute that was tapped: swap with someone on the pitch, come on without
// replacing anyone, or leave the board. The page closes the dialog after each of them. Cancel,
// Escape and a tap outside close it with nothing changed.
export default function BenchSwapDialog({ substitute, onPitch, onSwap, onPutOn, onRemove, onClose }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { cancelRef.current?.focus() }, [])

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !boxRef.current) return
    const focusable = [...boxRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md max-h-[85vh] flex flex-col"
      >
        <h2 id={titleId} dir="auto" className="text-lg font-bold">{t('bench.swapTitle', { name: substitute.name })}</h2>
        <p className="text-sm text-gray-400 mb-3">{onPitch.length > 0 ? t('bench.swapHint') : t('bench.nobody')}</p>
        <ul className="flex-1 overflow-y-auto space-y-1">
          {onPitch.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => onSwap(person.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start hover:bg-gray-700">
                <BenchDot person={person} />
                <span dir="auto" className="flex-1 truncate">{person.name}</span>
                <span className="text-xs text-gray-300">{person.position}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-700">
          <button type="button" onClick={onPutOn} className="py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold">{t('bench.putOn')}</button>
          <button type="button" onClick={onRemove} className="py-2.5 rounded-lg text-red-300 bg-gray-700 hover:bg-red-900/50 font-semibold">{t('common.remove')}</button>
        </div>
        <button type="button" ref={cancelRef} onClick={onClose} className="mt-2 py-2.5 rounded-lg bg-gray-700 font-semibold">{t('common.cancel')}</button>
      </div>
    </div>
  )
}
