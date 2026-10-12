import { monthGrid, weekdayOrder, type DotKind, type Month } from '../utils/schedule'

// One colour per kind of thing a day can hold; the same colours mark the items in the day list
export const DOT_COLOR: Record<DotKind, string> = {
  session: 'bg-sky-300',
  match: 'bg-blue-500',
  training: 'bg-green-500',
  plan: 'bg-emerald-300',
  task: 'bg-amber-400',
  other: 'bg-gray-400',
}

// Days are plain dates; formatting them in UTC shows the same day on every device
const utc = (date: string) => new Date(`${date}T00:00:00Z`)
export const longDay = (date: string, language: string) =>
  utc(date).toLocaleDateString(language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
export const monthTitle = ({ year, month }: Month, language: string) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
// 4 January 2026 is a Sunday, so day 4 + n is weekday n
export const weekdayName = (weekday: number, language: string) =>
  new Date(Date.UTC(2026, 0, 4 + weekday)).toLocaleDateString(language, { weekday: 'short', timeZone: 'UTC' })

interface Props {
  month: Month
  // 0 (Sunday) .. 6 (Saturday)
  weekStartsOn: number
  language: string
  today: string
  selected: string
  dots: (date: string) => DotKind[]
  onSelect: (date: string) => void
}

// A full month: whole weeks of day buttons, each with its number and a dot per kind of thing on it.
export default function MonthCalendar({ month, weekStartsOn, language, today, selected, dots, onSelect }: Props) {
  const weeks = monthGrid(month.year, month.month, weekStartsOn)
  const inMonth = (date: string) => Number(date.slice(5, 7)) === month.month

  return (
    <div role="grid" aria-label={monthTitle(month, language)} className="select-none">
      <div role="row" className="grid grid-cols-7 mb-1">
        {weekdayOrder(weekStartsOn).map((weekday) => (
          <div key={weekday} role="columnheader" className="text-center text-[11px] font-semibold text-gray-400 py-1">
            {weekdayName(weekday, language)}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className="grid grid-cols-7 gap-1 mb-1">
          {week.map((date) => {
            const isSelected = date === selected
            const isToday = date === today
            return (
              <div key={date} role="gridcell">
                <button
                  type="button"
                  onClick={() => onSelect(date)}
                  aria-label={longDay(date, language)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  className={`w-full aspect-square min-h-[44px] rounded-lg flex flex-col items-center justify-center gap-1 text-sm ${
                    isSelected ? 'bg-blue-600 text-white font-bold' : inMonth(date) ? 'bg-gray-800 text-gray-100 hover:bg-gray-700' : 'bg-gray-800/40 text-gray-500'
                  } ${isToday && !isSelected ? 'ring-2 ring-blue-400' : ''}`}
                >
                  <span>{Number(date.slice(8, 10))}</span>
                  <span className="flex gap-0.5 h-1.5" aria-hidden="true">
                    {dots(date).map((kind) => (
                      <span key={kind} data-dot={kind} className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[kind]}`} />
                    ))}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
