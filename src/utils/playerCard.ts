import type { PlayerPosition } from '../lib/types'

export type CardTier = 'gold' | 'silver' | 'bronze'
export type AttributeKey = 'SHO' | 'KEE' | 'PAS' | 'WIN' | 'FRM' | 'EXP'

export interface CardInput {
  stars: number
  position: PlayerPosition
  matches: number
  goals: number
  assists: number
  wins: number
  cleanSheets: number
  form: number | undefined
}

export interface PlayerCard {
  overall: number
  // No matches yet: the rating is only the star estimate
  isNew: boolean
  tier: CardTier
  attributes: { key: AttributeKey; value: number }[]
}

const cap = (v: number) => Math.max(1, Math.min(99, v))
const STATS_WEIGHT = 0.7
const FULL_WEIGHT_MATCHES = 10
const EXP_CAP_MATCHES = 60

const WEIGHTS: Record<'field' | 'gk', Partial<Record<AttributeKey, number>>> = {
  field: { SHO: 0.3, PAS: 0.2, WIN: 0.2, FRM: 0.2, EXP: 0.1 },
  gk: { KEE: 0.35, WIN: 0.25, FRM: 0.2, PAS: 0.1, EXP: 0.1 },
}

// FIFA-style rating: attributes from real results, blended with the star rating until a player
// has about 10 matches; after that real stats make up 70% of the overall.
export function playerCard(c: CardInput): PlayerCard {
  const per = (n: number) => (c.matches > 0 ? n / c.matches : 0)
  const isGk = c.position === 'GK'
  const raw: Record<AttributeKey, number> = {
    SHO: 45 + per(c.goals) * 80,
    KEE: 45 + per(c.cleanSheets) * 80,
    PAS: 45 + per(c.assists) * 100,
    WIN: 40 + per(c.wins) * 55,
    FRM: c.form !== undefined ? 40 + c.form * 11 : 45 + c.stars * 6,
    EXP: 50 + Math.min(c.matches, EXP_CAP_MATCHES) * 0.8,
  }
  const weights = WEIGHTS[isGk ? 'gk' : 'field']
  const statScore = (Object.entries(weights) as [AttributeKey, number][]).reduce((sum, [k, w]) => sum + cap(raw[k]) * w, 0)
  const starBase = 45 + c.stars * 6
  const w = STATS_WEIGHT * Math.min(1, c.matches / FULL_WEIGHT_MATCHES)
  const overall = Math.round(cap(starBase * (1 - w) + statScore * w))

  const keys: AttributeKey[] = [isGk ? 'KEE' : 'SHO', 'PAS', 'WIN', 'FRM', 'EXP']
  return {
    overall,
    isNew: c.matches === 0,
    tier: overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze',
    attributes: keys.map((key) => ({ key, value: Math.round(cap(raw[key])) })),
  }
}
