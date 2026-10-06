// A short-lived copy of each league's full history, so moving between the leaderboard, cards,
// records and profiles downloads it once instead of on every page. Only complete downloads are
// kept, and any change the app saves clears every copy (see supabase.ts).
export const LEAGUE_CACHE_MS = 60_000

const entries = new Map<string, { at: number; value: Promise<unknown> }>()

export function cachedLoad<T>(
  key: string,
  load: () => Promise<{ value: T; complete: boolean }>,
  now: () => number = Date.now,
): Promise<T> {
  const hit = entries.get(key)
  if (hit && now() - hit.at < LEAGUE_CACHE_MS) return hit.value as Promise<T>

  const drop = () => { if (entries.get(key)?.value === value) entries.delete(key) }
  const value: Promise<T> = load().then(
    (res) => { if (!res.complete) drop(); return res.value },
    (err) => { drop(); throw err },
  )
  entries.set(key, { at: now(), value })
  return value
}

export function forgetCachedLeagues() {
  entries.clear()
}

// Wraps fetch so that any request that changes something (a goal, an edit, a photo) clears the copies
export function forgetOnWrite(base: typeof fetch): typeof fetch {
  return (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') forgetCachedLeagues()
    return base(input, init)
  }
}
