export const FEATURES = [
  'cards', 'swaps', 'smart_balancing', 'awards', 'voting', 'leaderboard', 'potm',
  'profiles', 'badges', 'records', 'player_cards', 'photos', 'summary_share', 'coach_board',
] as const

export type FeatureKey = (typeof FEATURES)[number]

export const FEATURE_NEEDS: Partial<Record<FeatureKey, FeatureKey>> = {
  voting: 'awards',
  potm: 'leaderboard',
  badges: 'profiles',
}

export function setFeature(list: FeatureKey[], key: FeatureKey, on: boolean): FeatureKey[] {
  const next = new Set<FeatureKey>(list)
  if (on) {
    next.add(key)
    const needed = FEATURE_NEEDS[key]
    if (needed) next.add(needed)
  } else {
    next.delete(key)
    for (const f of FEATURES) if (FEATURE_NEEDS[f] === key) next.delete(f)
  }
  return FEATURES.filter((f) => next.has(f))
}

export function isValidFeatureList(list: unknown): list is FeatureKey[] {
  if (!Array.isArray(list)) return false
  const known: readonly unknown[] = FEATURES
  if (!list.every((k) => known.includes(k))) return false
  if (new Set(list).size !== list.length) return false
  return list.every((k: FeatureKey) => {
    const needed = FEATURE_NEEDS[k]
    return !needed || list.includes(needed)
  })
}
