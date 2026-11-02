import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Where a page's back link leads. A page reached from more than one place (a booking from Home,
// History or the schedule; a coach board from a booking or the boards list) is opened with this
// in the link's state, so its back link returns to the page it was opened from. `labelKey` is a
// translation key, so the label follows a language switch; `label` is text that needs none (a
// player's name).
export type BackTarget = { to: string; labelKey?: string; label?: string }
type BackState = { back?: BackTarget } | null

// Link state that brings the page being opened back to `target`
export const backTo = (target: BackTarget): { back: BackTarget } => ({ back: target })

// The way back this page was opened with, so a page that moves to a new address of its own
// (a new board once saved) keeps it
export function useBackState(): BackState {
  return (useLocation().state as BackState) ?? null
}

// A page's back link: to the page it was opened from, else to its own parent (`to`, `labelKey`)
export function BackLink({ to, labelKey, label, className = 'text-gray-400 hover:text-white text-sm' }: BackTarget & { className?: string }) {
  const { t } = useTranslation()
  const back = useBackState()?.back
  const target = back?.to ? back : { to, labelKey, label }
  const text = target.labelKey ? t(target.labelKey) : (target.label ?? '')
  return (
    <Link to={target.to} className={`inline-flex items-center gap-1 ${className}`}>
      {/* Points the way back in either direction: left in English, right in Arabic */}
      <span aria-hidden="true" className="rtl:-scale-x-100">←</span>
      <span dir="auto">{text}</span>
    </Link>
  )
}
