import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'

// A session's day as people say it, in their language: "Fri 30 Oct", with the year only when it
// is not this year ("Sat 14 Dec 2025"). The stored date is a plain yyyy-MM-dd with no time zone.
export function sessionDate(date: string, language: string, today: Date = new Date()): string {
  const day = new Date(`${date}T00:00:00`)
  if (Number.isNaN(day.getTime())) return date
  const locale = language === 'ar' ? ar : enUS
  const pattern = day.getFullYear() === today.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy'
  return format(day, pattern, { locale })
}
