import type { League } from './tenancy'

export const LEGACY_SLUG = 'eagles'

const LAST_LEAGUE_KEY = 'scoreleader.lastLeague'
const KEPT_PAGES = ['home', 'players', 'history', 'lineups', 'settings', 'sessions/new']

// Keeps list-level pages when switching league; anything tied to an id falls back to home.
export function switchLeaguePath(pathname: string, newSlug: string): string {
  const rest = pathname.split('/').slice(3).join('/')
  const page = KEPT_PAGES.includes(rest) ? rest : 'home'
  return `/admin/${newSlug}/${page}`
}

export function readLastLeague(): string | null {
  try { return localStorage.getItem(LAST_LEAGUE_KEY) } catch { return null }
}

export function writeLastLeague(slug: string): void {
  try { localStorage.setItem(LAST_LEAGUE_KEY, slug) } catch { /* not remembered */ }
}

// Last-used league if the admin still owns it, else the first one.
export function pickLeague(leagues: League[]): string | null {
  const last = readLastLeague()
  return leagues.find(l => l.slug === last)?.slug ?? leagues[0]?.slug ?? null
}
