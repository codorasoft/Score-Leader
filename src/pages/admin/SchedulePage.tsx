import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { deleteScheduleItem, fetchScheduleExtras, fetchScheduleItems, saveScheduleItem, setDone, skipDay } from '../../lib/scheduleApi'
import {
  dotsFor, draftToRow, emptyDraft, isDone, itemsOn, monthGrid, monthOf, shiftMonth, timeLabel, toDraft, weekStartFor,
  type Month, type ScheduleDraft, type ScheduleExtras, type ScheduleItem,
} from '../../utils/schedule'
import { localToday } from '../../utils/trainingDays'
import MonthCalendar, { DOT_COLOR, longDay, monthTitle } from '../../components/MonthCalendar'
import ScheduleItemDialog from '../../components/ScheduleItemDialog'

const NO_EXTRAS: ScheduleExtras = { sessions: [], plans: [] }

// The coach's schedule: a full month, and under it the chosen day with everything on it. Match
// sessions and training plans come from the app itself and open their own pages.
export default function SchedulePage() {
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const withPlans = useFeature('training')
  const weekStartsOn = weekStartFor(i18n.language)
  const today = localToday()
  const [month, setMonth] = useState<Month>(() => monthOf(today))
  const [selected, setSelected] = useState(today)
  const [items, setItems] = useState<ScheduleItem[] | null>(null)
  const [extras, setExtras] = useState<ScheduleExtras>(NO_EXTRAS)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // The form: a new item for the chosen day, or the item that was tapped
  const [form, setForm] = useState<{ item: ScheduleItem | null } | null>(null)

  // Latest request, so a slow answer for a month or league we have left is dropped
  const current = useRef('')
  const load = useCallback(() => {
    const weeks = monthGrid(month.year, month.month, weekStartsOn)
    const from = weeks[0][0]
    const to = weeks[weeks.length - 1][6]
    const request = `${league.id}/${from}/${to}`
    current.current = request
    setFailed(false)
    return Promise.all([fetchScheduleItems(league.id, from, to), fetchScheduleExtras(league.id, from, to, withPlans)])
      .then(([loaded, more]) => {
        if (current.current !== request) return
        setItems(loaded)
        setExtras(more)
      })
      .catch(() => { if (current.current === request) setFailed(true) })
  }, [league.id, month.year, month.month, weekStartsOn, withPlans])

  useEffect(() => { load() }, [load])

  // Another month opens on today when it holds today, otherwise on its first day
  const show = (next: Month) => {
    const first = `${next.year}-${String(next.month).padStart(2, '0')}-01`
    setMonth(next)
    setSelected(first.slice(0, 7) === today.slice(0, 7) ? today : first)
  }
  // A day of a neighbouring month, tapped in the first or last week, opens that month
  const select = (date: string) => {
    setSelected(date)
    const of = monthOf(date)
    if (of.year !== month.year || of.month !== month.month) setMonth(of)
  }

  // One write at a time; the month is read again when it worked
  const write = async (run: () => Promise<boolean>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    const ok = await run()
    if (ok) await load()
    setBusy(false)
    return ok
  }
  const save = async (draft: ScheduleDraft) => {
    if (await write(() => saveScheduleItem(league.id, form?.item?.id ?? null, draftToRow(draft)))) setForm(null)
  }
  const remove = async (run: () => Promise<boolean>) => { if (await write(run)) setForm(null) }

  const dayItems = items ? itemsOn(items, selected) : []
  const daySessions = extras.sessions.filter((s) => s.date === selected)
  const dayPlans = extras.plans.filter((p) => p.training_date === selected)
  const nothing = dayItems.length + daySessions.length + dayPlans.length === 0
  const navButton = 'w-10 h-10 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg'
  const row = 'flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-2.5'

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-3">{t('schedule.title')}</h1>

      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => show(shiftMonth(month, -1))} aria-label={t('schedule.prevMonth')} className={navButton}>
          <span aria-hidden="true">‹</span>
        </button>
        <h2 className="flex-1 text-center font-semibold">{monthTitle(month, i18n.language)}</h2>
        <button type="button" onClick={() => show(shiftMonth(month, 1))} aria-label={t('schedule.nextMonth')} className={navButton}>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" onClick={() => show(monthOf(today))} className="h-10 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold">
          {t('schedule.today')}
        </button>
      </div>

      {failed ? (
        <div className="text-center py-8">
          <p className="text-gray-300 mb-3">{t('common.loadFailed')}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 rounded font-semibold hover:bg-blue-700">{t('common.retry')}</button>
        </div>
      ) : !items ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <>
          <MonthCalendar
            month={month}
            weekStartsOn={weekStartsOn}
            language={i18n.language}
            today={today}
            selected={selected}
            dots={(date) => dotsFor(items, extras, date)}
            onSelect={select}
          />

          <div className="flex items-center gap-2 mt-4 mb-2">
            <h2 className="flex-1 min-w-0 font-semibold">{longDay(selected, i18n.language)}</h2>
            <button type="button" onClick={() => setForm({ item: null })} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold">
              ＋ {t('schedule.add')}
            </button>
          </div>

          {nothing && <p className="text-gray-500 text-center py-6">{t('schedule.empty')}</p>}

          <ul aria-label={longDay(selected, i18n.language)} className="space-y-2">
            {dayItems.map((item) => {
              const done = isDone(item, selected)
              return (
                <li key={item.id} className={row}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLOR[item.kind]}`} aria-hidden="true" />
                  <button type="button" onClick={() => setForm({ item })} className="flex-1 min-w-0 text-start">
                    <span className="block text-xs text-gray-400" dir="ltr">{timeLabel(item) ?? t('schedule.allDay')}</span>
                    <span className={`block font-semibold break-words ${done ? 'line-through text-gray-400' : ''}`} dir="auto">{item.title}</span>
                    <span className="block text-xs text-gray-400">{t(`schedule.kinds.${item.kind}`)}</span>
                  </button>
                  {item.repeat_days.length > 0 && (
                    <span role="img" aria-label={t('schedule.repeats')} title={t('schedule.repeats')} className="text-gray-400">↻</span>
                  )}
                  {item.kind === 'task' && (
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busy}
                      onChange={(e) => write(() => setDone(item, selected, e.target.checked))}
                      aria-label={t('schedule.done', { title: item.title })}
                      className="w-6 h-6 shrink-0"
                    />
                  )}
                </li>
              )
            })}
            {daySessions.map((s) => (
              <li key={s.id}>
                <Link to={adminPath(`/sessions/${s.id}`)} className={`${row} hover:bg-gray-700`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLOR.session}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0 font-semibold">{t('schedule.session')}</span>
                  <span className="text-gray-500" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
            {dayPlans.map((p) => (
              <li key={p.id}>
                <Link to={adminPath(`/trainings/${p.id}`)} className={`${row} hover:bg-gray-700`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLOR.plan}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-gray-400">{t('schedule.plan')}</span>
                    {p.title && <span className="block font-semibold break-words" dir="auto">{p.title}</span>}
                  </span>
                  <span className="text-gray-500" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {form && (
        <ScheduleItemDialog
          key={form.item?.id ?? 'new'}
          initial={form.item ? toDraft(form.item) : emptyDraft(selected)}
          editing={!!form.item}
          weekStartsOn={weekStartsOn}
          busy={busy}
          onSave={save}
          onDeleteAll={form.item ? () => remove(() => deleteScheduleItem(form.item!.id)) : undefined}
          onDeleteDay={form.item && form.item.repeat_days.length > 0 ? () => remove(() => skipDay(form.item!, selected)) : undefined}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
