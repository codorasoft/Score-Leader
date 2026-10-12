import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { deleteScheduleItem, fetchScheduleExtras, fetchScheduleItems, saveScheduleItem, setDone, skipDay } from '../../lib/scheduleApi'
import {
  addDays, dotsFor, draftToRow, emptyDraft, firstOfMonth, isDone, itemsOn, monthGrid, monthOf, repeatModeOf, shiftMonth, timeLabel,
  toDraft, weekOf, weekStartFor, type Month, type ScheduleDraft, type ScheduleExtras, type ScheduleItem,
} from '../../utils/schedule'
import { localToday } from '../../utils/trainingDays'
import MonthCalendar, { DOT_COLOR, longDay, monthTitle } from '../../components/MonthCalendar'
import ScheduleItemDialog from '../../components/ScheduleItemDialog'
import TimeGrid from '../../components/TimeGrid'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']
const VIEW_KEY = 'scoreleader.scheduleView'
const NO_EXTRAS: ScheduleExtras = { sessions: [], plans: [] }

// The view last used, so a coach who works by the week opens on the week
function rememberedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(saved as View) ? (saved as View) : 'month'
  } catch {
    return 'month'
  }
}

// "Oct 12 – Oct 18, 2026"
function weekTitle(days: string[], language: string): string {
  const short = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(language, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${short(days[0])} – ${short(days[6])}, ${days[6].slice(0, 4)}`
}

// The coach's schedule: a month, a week or a day, with everything on it. Match sessions and
// training plans come from the app itself and open their own pages.
export default function SchedulePage() {
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const adminPath = useAdminPath()
  const withPlans = useFeature('training')
  const weekStartsOn = weekStartFor(i18n.language)
  const today = localToday()
  const [view, setView] = useState<View>(rememberedView)
  // The chosen day; the month, week or day shown is the one that holds it
  const [selected, setSelected] = useState(today)
  const [items, setItems] = useState<ScheduleItem[] | null>(null)
  const [extras, setExtras] = useState<ScheduleExtras>(NO_EXTRAS)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // The form: a new item for a day (and maybe a start time), or an item opened from one of its days
  const [form, setForm] = useState<{ item: ScheduleItem | null; date: string; start?: string } | null>(null)

  const month: Month = monthOf(selected)
  const week = weekOf(selected, weekStartsOn)
  const weeks = monthGrid(month.year, month.month, weekStartsOn)
  // The days whose items are needed for what is on screen
  const [from, to] = view === 'month' ? [weeks[0][0], weeks[weeks.length - 1][6]] : view === 'week' ? [week[0], week[6]] : [selected, selected]

  // Latest request, so a slow answer for days or a league we have left is dropped
  const current = useRef('')
  const load = useCallback(() => {
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
  }, [league.id, from, to, withPlans])

  useEffect(() => { load() }, [load])

  const choose = (next: View) => {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* storage blocked: the view is just not remembered */ }
  }
  // Another month opens on today when it holds today, otherwise on its first day
  const showMonth = (next: Month) => {
    const first = firstOfMonth(next)
    setSelected(first.slice(0, 7) === today.slice(0, 7) ? today : first)
  }
  const step = (by: -1 | 1) => {
    if (view === 'month') showMonth(shiftMonth(month, by))
    else setSelected(addDays(selected, view === 'week' ? 7 * by : by))
  }

  // One write at a time; what is on screen is read again when it worked
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
  const title = view === 'month' ? monthTitle(month, i18n.language) : view === 'week' ? weekTitle(week, i18n.language) : longDay(selected, i18n.language)
  const navButton = 'w-10 h-10 shrink-0 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg'
  const row = 'flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-2.5'
  const addButton = (
    <button type="button" onClick={() => setForm({ item: null, date: selected })} className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold">
      ＋ {t('schedule.add')}
    </button>
  )

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="flex-1 min-w-0 text-xl font-bold">{t('schedule.title')}</h1>
        <div role="group" aria-label={t('schedule.view')} className="flex rounded-lg bg-gray-800 p-0.5">
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${view === v ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}>
              {t(`schedule.views.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => step(-1)} aria-label={t(`schedule.prev.${view}`)} className={navButton}>
          <span aria-hidden="true">‹</span>
        </button>
        <h2 className="flex-1 min-w-0 text-center font-semibold">{title}</h2>
        <button type="button" onClick={() => step(1)} aria-label={t(`schedule.next.${view}`)} className={navButton}>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" onClick={() => setSelected(today)} className="h-10 shrink-0 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold">
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
      ) : view === 'month' ? (
        <>
          <MonthCalendar
            month={month}
            weekStartsOn={weekStartsOn}
            language={i18n.language}
            today={today}
            selected={selected}
            dots={(date) => dotsFor(items, extras, date)}
            onSelect={setSelected}
          />

          <div className="flex items-center gap-2 mt-4 mb-2">
            <h2 className="flex-1 min-w-0 font-semibold">{longDay(selected, i18n.language)}</h2>
            {addButton}
          </div>

          {nothing && <p className="text-gray-500 text-center py-6">{t('schedule.empty')}</p>}

          <ul aria-label={longDay(selected, i18n.language)} className="space-y-2">
            {dayItems.map((item) => {
              const done = isDone(item, selected)
              const repeat = repeatModeOf(item)
              return (
                <li key={item.id} className={row}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLOR[item.kind]}`} aria-hidden="true" />
                  <button type="button" onClick={() => setForm({ item, date: selected })} className="flex-1 min-w-0 text-start">
                    <span className="block text-xs text-gray-400" dir="ltr">{timeLabel(item) ?? t('schedule.allDay')}</span>
                    <span className={`block font-semibold break-words ${done ? 'line-through text-gray-400' : ''}`} dir="auto">{item.title}</span>
                    <span className="block text-xs text-gray-400">{t(`schedule.kinds.${item.kind}`)}</span>
                  </button>
                  {repeat !== 'none' && (
                    <span role="img" aria-label={t(`schedule.repeatModes.${repeat}`)} title={t(`schedule.repeatModes.${repeat}`)} className="text-gray-400">↻</span>
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
      ) : (
        <>
          <TimeGrid
            days={view === 'week' ? week : [selected]}
            language={i18n.language}
            today={today}
            items={items}
            extras={extras}
            onOpen={(item, date) => setForm({ item, date })}
            onAddAt={(date, start) => setForm({ item: null, date, start })}
            // A day's heading in the week opens that day by the hour
            onPickDay={view === 'week' ? (date) => { setSelected(date); choose('day') } : undefined}
            sessionPath={(id) => adminPath(`/sessions/${id}`)}
            planPath={(id) => adminPath(`/trainings/${id}`)}
          />
          <div className="flex justify-end mt-3">{addButton}</div>
        </>
      )}

      {form && (
        <ScheduleItemDialog
          key={form.item?.id ?? `new-${form.date}-${form.start ?? ''}`}
          initial={form.item ? toDraft(form.item) : emptyDraft(form.date, form.start)}
          editing={!!form.item}
          weekStartsOn={weekStartsOn}
          busy={busy}
          onSave={save}
          onDeleteAll={form.item ? () => remove(() => deleteScheduleItem(form.item!.id)) : undefined}
          onDeleteDay={form.item && repeatModeOf(form.item) !== 'none' ? () => remove(() => skipDay(form.item!, form.date)) : undefined}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
