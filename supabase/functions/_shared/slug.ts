export const RESERVED_SLUGS: readonly string[] = [
  'leagues', 'players', 'history', 'sessions', 'lineups', 'settings', 'new', 'super',
]

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugError(slug: string): 'format' | 'length' | 'reserved' | null {
  if (!SLUG_FORMAT.test(slug)) return 'format'
  if (slug.length < 3 || slug.length > 40) return 'length'
  if (RESERVED_SLUGS.includes(slug)) return 'reserved'
  return null
}

export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}
