import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LeagueLogo } from './LeagueLogo'
import { switchLeaguePath } from '../lib/leaguePaths'
import type { League } from '../lib/tenancy'

const item = 'flex items-center gap-2 w-full px-3 py-2 text-sm text-start rounded-lg'

export function LeagueSwitcher({ current, leagues, maxLeagues }: { current: League; leagues: League[]; maxLeagues: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const atLimit = leagues.length >= maxLeagues
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  const menuItems = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

  // Opening moves focus to the first item so the arrow keys work straight away.
  useEffect(() => { if (open) menuItems()[0]?.focus() }, [open])

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => { e.preventDefault(); items[(to + items.length) % items.length]?.focus() }
    switch (e.key) {
      case 'ArrowDown': return move(at + 1)
      case 'ArrowUp': return move(at - 1)
      case 'Home': return move(0)
      case 'End': return move(items.length - 1)
      case 'Escape':
        e.preventDefault()
        close()
        buttonRef.current?.focus()
        return
      case 'Tab': return close()
    }
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current.name} - ${t('league.switch')}`}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 min-w-0 max-w-full h-10 px-1 rounded-lg hover:bg-gray-800"
      >
        <LeagueLogo league={current} size="sm" />
        <span className="font-bold text-lg truncate">{current.name}</span>
        <span aria-hidden="true" className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div ref={menuRef} role="menu" aria-label={t('league.switch')} onKeyDown={onMenuKeyDown} className="absolute start-0 top-full mt-1 z-50 w-64 max-w-[80vw] p-1 rounded-xl bg-gray-800 border border-gray-700 shadow-lg">
            {leagues.map(l => (
              <button
                key={l.id}
                role="menuitem"
                type="button"
                tabIndex={-1}
                aria-current={l.slug === current.slug ? 'true' : undefined}
                onClick={() => { close(); if (l.slug !== current.slug) navigate(switchLeaguePath(location.pathname, l.slug)) }}
                className={`${item} hover:bg-gray-700`}
              >
                <LeagueLogo league={l} size="sm" />
                <span className="truncate flex-1">{l.name}</span>
                {l.slug === current.slug && <span aria-hidden="true" className="text-blue-400">✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-gray-700" />
            {atLimit ? (
              <span role="menuitem" tabIndex={-1} aria-disabled="true" className={`${item} text-gray-500 cursor-not-allowed`}>
                {t('league.limitReached', { used: leagues.length, max: maxLeagues })}
              </span>
            ) : (
              <Link role="menuitem" tabIndex={-1} to="/admin/leagues/new" onClick={close} className={`${item} hover:bg-gray-700`}>
                {t('league.newLeague', { used: leagues.length, max: maxLeagues })}
              </Link>
            )}
            <Link role="menuitem" tabIndex={-1} to={`/admin/${current.slug}/settings`} onClick={close} className={`${item} hover:bg-gray-700`}>
              {t('league.settings')}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
