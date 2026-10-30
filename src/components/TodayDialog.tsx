import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath } from '../contexts/LeagueContext'
import type { TodayRow } from '../utils/schedule'
import { longDay } from './MonthCalendar'
import TodayList from './TodayList'

interface Props {
  date: string
  rows: TodayRow[]
  onClose: () => void
}

// The popup of the day: what is on today, shown once when the app is first opened that day.
// Tapping outside, Escape, a row and either button all close it.
export default function TodayDialog({ date, rows, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const adminPath = useAdminPath()
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const gotItRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { gotItRef.current?.focus() }, [])

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !boxRef.current) return
    const focusable = [...boxRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-xl p-5 w-full max-w-sm"
      >
        <h2 id={titleId} className="text-lg font-bold">{t('today.title')}</h2>
        <p className="text-sm text-gray-400 mb-3">{longDay(date, i18n.language)}</p>
        {/* A long day scrolls here, so the buttons always stay on screen */}
        <div className="max-h-[50vh] overflow-y-auto">
          <TodayList rows={rows} label={t('today.title')} onNavigate={onClose} />
        </div>
        <div className="flex gap-3 mt-4">
          <Link to={adminPath('/schedule')} onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-center">
            {t('today.openSchedule')}
          </Link>
          <button type="button" ref={gotItRef} onClick={onClose} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold">
            {t('today.gotIt')}
          </button>
        </div>
      </div>
    </div>
  )
}
