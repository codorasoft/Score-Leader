import type { TFunction } from 'i18next'
import type { CoachEvent } from '../lib/types'

// A training's name, or "Training" when it has none; a match is "vs" its opponent
export function dayTitle(ev: CoachEvent, t: TFunction): string {
  if (ev.kind === 'match') return t('coach.vs', { opponent: ev.title ?? '' })
  return ev.title ?? t('coach.kind.training')
}
