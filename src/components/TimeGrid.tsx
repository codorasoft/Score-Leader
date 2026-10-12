import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { gridHours, itemsOn, layoutDay, timeLabel, weekdayOf, type ScheduleExtras, type ScheduleItem, type ScheduleKind } from '../utils/schedule'
import { DOT_COLOR, longDay, weekdayName } from './MonthCalendar'

// Height of one hour, in pixels
const HOUR_PX = 48
const two = (n: number) => String(n).padStart(2, '0')

// An item's block in the grid, by kind (the same colours as the calendar's dots)
const BLOCK: Record<ScheduleKind, string> = {
  task: 'bg-amber-400 text-gray-900',
  training: 'bg-green-600 text-white',
  match: 'bg-blue-600 text-white',
  other: 'bg-gray-500 text-white',
}

interface Props {
  // One day (the day view) or seven (the week view)
  days: string[]
  language: string
  today: string
  items: ScheduleItem[]
  extras: ScheduleExtras
  onOpen: (item: ScheduleItem, date: string) => void
  // An empty hour was tapped: a new item for that day, starting then ('HH:00')
  onAddAt: (date: string, start: string) => void
  // A day's heading was tapped (the week view); without it the headings are plain text
  onPickDay?: (date: string) => void
  sessionPath: (id: string) => string
  planPath: (id: string) => string
}

// Days side by side with the hours down the page: each timed item is a block at its time, as
// tall as it is long; what has no time sits in a row above the hours.
export default function TimeGrid({ days, language, today, items, extras, onOpen, onAddAt, onPickDay, sessionPath, planPath }: Props) {
  const { t } = useTranslation()
  const perDay = days.map((date) => ({ date, on: itemsOn(items, date) }))
  // One range of hours for every day shown, wide enough for the earliest and the latest item
  const { from, to } = gridHours(perDay.flatMap((d) => d.on))
  const hours = Array.from({ length: to - from }, (_, i) => from + i)
  const columns = { gridTemplateColumns: `2.25rem repeat(${days.length}, minmax(0, 1fr))` }
  const wide = days.length === 1
  const chip = 'block w-full truncate rounded px-1 py-0.5 text-[10px] font-semibold text-start'

  return (
    <div role="table" aria-label={t(wide ? 'schedule.views.day' : 'schedule.views.week')} className="select-none">
      <div role="row" className="grid gap-x-0.5" style={columns}>
        <div />
        {days.map((date) => {
          const heading = (
            <>
              <span className="block text-[11px] text-gray-400">{weekdayName(weekdayOf(date), language)}</span>
              <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${date === today ? 'bg-blue-600 text-white' : 'text-gray-100'}`}>
                {Number(date.slice(8))}
              </span>
            </>
          )
          return (
            <div key={date} role="columnheader" className="text-center pb-1">
              {onPickDay
                ? <button type="button" onClick={() => onPickDay(date)} aria-label={longDay(date, language)} className="w-full rounded-lg hover:bg-gray-800">{heading}</button>
                : heading}
            </div>
          )
        })}
      </div>

      {/* What has no time: all-day items, match sessions and training plans */}
      <div className="grid gap-x-0.5 border-y border-gray-800 py-1" style={columns}>
        <div className="text-[9px] leading-tight text-gray-500 pt-0.5">{t('schedule.allDay')}</div>
        {perDay.map(({ date, on }) => (
          <div key={date} data-all-day={date} className="min-w-0 space-y-0.5 min-h-[1.25rem]">
            {on.filter((i) => !i.start_time).map((item) => (
              <button key={item.id} type="button" onClick={() => onOpen(item, date)} className={`${chip} ${BLOCK[item.kind]}`} dir="auto">
                {item.title}
              </button>
            ))}
            {extras.sessions.filter((s) => s.date === date).map((s) => (
              <Link key={s.id} to={sessionPath(s.id)} className={`${chip} ${DOT_COLOR.session} text-gray-900`}>{t('schedule.session')}</Link>
            ))}
            {extras.plans.filter((p) => p.training_date === date).map((p) => (
              <Link key={p.id} to={planPath(p.id)} className={`${chip} ${DOT_COLOR.plan} text-gray-900`} dir="auto">
                {p.title ?? t('schedule.plan')}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="grid gap-x-0.5" style={columns}>
        <div className="relative" style={{ height: hours.length * HOUR_PX }} aria-hidden="true">
          {hours.map((hour, i) => (
            <span key={hour} className="absolute start-0 -translate-y-1/2 text-[10px] text-gray-500" style={{ top: i * HOUR_PX }} dir="ltr">
              {i === 0 ? '' : `${two(hour)}:00`}
            </span>
          ))}
        </div>
        {perDay.map(({ date, on }) => (
          <div key={date} data-day={date} className="relative min-w-0 rounded bg-gray-800/40" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((hour, i) => (
              <button
                key={hour}
                type="button"
                onClick={() => onAddAt(date, `${two(hour)}:00`)}
                aria-label={t('schedule.addAt', { time: `${two(hour)}:00` })}
                className="absolute inset-x-0 border-t border-gray-800 hover:bg-gray-700/40"
                style={{ top: i * HOUR_PX, height: HOUR_PX }}
              />
            ))}
            {layoutDay(on).map(({ item, start, end, lane, lanes }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item, date)}
                className={`absolute overflow-hidden rounded px-1 py-0.5 text-start leading-tight shadow ${BLOCK[item.kind]}`}
                style={{
                  top: ((start - from * 60) / 60) * HOUR_PX,
                  height: Math.max(((end - start) / 60) * HOUR_PX, 18),
                  insetInlineStart: `${(lane / lanes) * 100}%`,
                  width: `${100 / lanes}%`,
                }}
              >
                <span className={`block text-[9px] opacity-80 ${wide ? '' : 'truncate'}`} dir="ltr">{timeLabel(item)}</span>
                <span className={`block font-semibold break-words ${wide ? 'text-sm' : 'text-[10px]'}`} dir="auto">{item.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
