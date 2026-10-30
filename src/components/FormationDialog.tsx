import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_IN_LINE, MAX_LINES, fitsPitch, formationName, parseFormation, suggestedFormations } from '../utils/formation'
import { FormationDiagram } from './FormationDiagram'

interface Props {
  // How many are on the pitch, players and guests together: 2 to 11
  onPitch: number
  // The board's formation, when it has one
  current: string | null
  onApply: (name: string) => void
  onClose: () => void
}

// Choosing a formation for the players on the pitch: one of the suggestions for their number,
// or one built line by line. There is one formation in hand, the one being built; a suggestion
// is a quick way to set it. It can be applied only when it uses exactly the players on the
// pitch. Cancel, Escape and a tap outside close without changing anything.
export default function FormationDialog({ onPitch, current, onApply, onClose }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const applyRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const suggested = suggestedFormations(onPitch)
  const [lines, setLines] = useState<number[]>(() => {
    const now = parseFormation(current)
    return now && fitsPitch(now, onPitch) ? now : parseFormation(suggested[0]) ?? [1]
  })
  const name = formationName(lines)
  const fits = fitsPitch(lines, onPitch)
  // Everyone but the goalkeeper, less those the lines already hold
  const left = onPitch - 1 - lines.reduce((sum, n) => sum + n, 0)

  useEffect(() => { (applyRef.current?.disabled ? cancelRef : applyRef).current?.focus() }, [])

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !boxRef.current) return
    const focusable = [...boxRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const setLine = (at: number, count: number) => setLines(lines.map((n, i) => (i === at ? count : n)))
  const step = 'w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold disabled:opacity-40'

  return (
    <div className="dialog-backdrop fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md max-h-[90vh] flex flex-col"
      >
        <h2 id={titleId} className="text-lg font-bold">{t('formation.title')}</h2>
        <p className="text-sm text-gray-400 mb-3">{t('formation.forCount', { players: onPitch, rest: onPitch - 1 })}</p>

        {/* A long builder scrolls here, so the buttons always stay on screen */}
        <div className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold mb-2">{t('formation.suggested')}</h3>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {suggested.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === name}
                onClick={() => setLines(parseFormation(option)!)}
                className={`flex flex-col items-center gap-1 rounded-lg p-1.5 border-2 ${option === name ? 'border-blue-500 bg-blue-600/30' : 'border-transparent bg-gray-700 hover:bg-gray-600'}`}
              >
                <FormationDiagram lines={parseFormation(option)!} className="w-full" />
                {/* Always left to right: in Arabic 4-3-3 must not read as 3-3-4 */}
                <span dir="ltr" className="text-sm font-bold">{option}</span>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-semibold mb-2">{t('formation.custom')}</h3>
          <div className="flex items-center gap-3 mb-3">
            <FormationDiagram lines={lines} className="w-20 shrink-0" />
            <output className="flex flex-col gap-1">
              <span dir="ltr" className="text-2xl font-bold">{name}</span>
              <span className={`text-sm ${fits ? 'text-green-300' : 'text-yellow-300'}`}>
                {left > 0 ? t('formation.left', { count: left }) : left < 0 ? t('formation.over', { count: -left }) : t('formation.allPlaced')}
              </span>
            </output>
          </div>
          <p className="text-xs text-gray-400 mb-1">{t('formation.fromDefence')}</p>
          <ul className="space-y-1.5">
            {lines.map((count, at) => (
              <li key={at} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{t('formation.line', { number: at + 1 })}</span>
                <button type="button" className={step} disabled={count <= 1} aria-label={t('formation.fewer', { number: at + 1 })}
                  onClick={() => setLine(at, count - 1)}>−</button>
                <span className="w-6 text-center font-bold" aria-hidden="true">{count}</span>
                <button type="button" className={step} disabled={count >= MAX_IN_LINE} aria-label={t('formation.more', { number: at + 1 })}
                  onClick={() => setLine(at, count + 1)}>＋</button>
                <button type="button" disabled={lines.length <= 1} aria-label={t('formation.removeLine', { number: at + 1 })}
                  onClick={() => setLines(lines.filter((_, i) => i !== at))}
                  className="w-9 h-9 rounded-lg text-red-300 hover:bg-red-900/50 disabled:opacity-40">✕</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={lines.length >= MAX_LINES} onClick={() => setLines([...lines, 1])}
            className="w-full mt-2 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold disabled:opacity-40">
            <span aria-hidden="true">＋ </span>{t('formation.addLine')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" ref={cancelRef} onClick={onClose} className="py-2.5 rounded-lg bg-gray-700 font-semibold">{t('common.cancel')}</button>
          <button type="button" ref={applyRef} disabled={!fits} onClick={() => onApply(name)}
            className="py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-50">
            {t('formation.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
