// Which day's items were already shown for which league, kept on the device so the popup of
// today's items comes up once a day. Storage holds { "<league id>": "2026-10-13" }.
const KEY = 'scoreleader.todaySeen'

// Also kept here, so a device whose storage is blocked or full still shows the popup only once
// until the page is reloaded
const memory = new Map<string, string>()

// Anything that is not our own map (damaged, or written by something else) counts as empty
function stored(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

export function isHandled(leagueId: string, date: string): boolean {
  return memory.get(leagueId) === date || stored()[leagueId] === date
}

export function markHandled(leagueId: string, date: string): void {
  memory.set(leagueId, date)
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...stored(), [leagueId]: date }))
  } catch { /* storage blocked or full: remembered in memory only */ }
}

// Forgets the in-memory copy only; for tests that stand for a page reload
export function resetTodaySeen(): void {
  memory.clear()
}
