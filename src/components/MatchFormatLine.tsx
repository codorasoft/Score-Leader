import { useTranslation } from 'react-i18next'
import type { MatchFormat } from '../utils/matchFormat'

// One line describing a match format, e.g. "2 × 10 min · no goal limit · a draw stays a draw"
export function MatchFormatLine({ format }: { format: MatchFormat }) {
  const { t } = useTranslation()
  const parts = [t('format.line.periods', { count: format.period_count, minutes: format.period_minutes })]
  if (format.extra_time_minutes) parts.push(t('format.line.extraTime', { minutes: format.extra_time_minutes }))
  if (format.penalties) parts.push(t('format.line.penalties'))
  parts.push(format.goal_limit ? t('format.line.goalLimit', { count: format.goal_limit }) : t('format.line.noGoalLimit'))
  if (!format.penalties) parts.push(t(format.draw_rule === 'stay' ? 'format.line.drawStay' : 'format.line.drawDraw'))
  return <p className="text-xs sm:text-sm text-gray-400 text-center leading-snug">{parts.join(' · ')}</p>
}
