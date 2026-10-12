// A training's day is a plain date ('2026-10-12') with no time and no time zone. These compare
// and show it on the device's own calendar, never in UTC: a coach in UTC+3 at half past
// midnight is already on the next day.

const two = (n: number) => String(n).padStart(2, '0')

export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

// Upcoming nearest first, past latest first; trainings on the same day keep the order given.
export function groupByDay<T extends { training_date: string }>(
  list: T[],
  today: string,
): { today: T[]; upcoming: T[]; past: T[] } {
  const byDate = (a: T, b: T) => (a.training_date < b.training_date ? -1 : a.training_date > b.training_date ? 1 : 0)
  return {
    today: list.filter((t) => t.training_date === today),
    upcoming: list.filter((t) => t.training_date > today).sort(byDate),
    past: list.filter((t) => t.training_date < today).sort((a, b) => byDate(b, a)),
  }
}

// e.g. "Mon, Oct 12, 2026" in English
export function dayLabel(date: string, language: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(language, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}
