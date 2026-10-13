import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath } from '../contexts/LeagueContext'
import type { TodayRow } from '../utils/schedule'
import { DOT_COLOR } from './MonthCalendar'

interface Props {
  rows: TodayRow[]
  // What the list is called for screen readers
  label: string
  // A row was tapped, on its way to its page
  onNavigate?: () => void
}

// A schedule item is changed on the schedule; a match session and a training plan on their own pages
const pageOf = (row: TodayRow) =>
  row.kind === 'session' ? `/sessions/${row.id}` : row.kind === 'plan' ? `/trainings/${row.id}` : '/schedule'

// What is on today, one link per row: shared by the popup of the day and the card on Home
export default function TodayList({ rows, label, onNavigate }: Props) {
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const small = 'block text-xs text-gray-400'
  const main = 'block font-semibold break-words'

  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={`${row.kind}:${row.id}`}>
          <Link to={adminPath(pageOf(row))} onClick={onNavigate} className="flex items-center gap-3 rounded-lg bg-gray-700/60 hover:bg-gray-700 px-3 py-2.5 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLOR[row.dot]}`} aria-hidden="true" />
            <span className="flex-1 min-w-0">
              {row.kind === 'plan' ? (
                <span className={small}>{t('schedule.plan')}</span>
              ) : row.time ? (
                <span className={small} dir="ltr">{row.time}</span>
              ) : (
                <span className={small}>{t('schedule.allDay')}</span>
              )}
              {row.kind === 'session' ? (
                <span className={main}>{t('schedule.session')}</span>
              ) : row.title && (
                <span className={main} dir="auto">{row.title}</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
