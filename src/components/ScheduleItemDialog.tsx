import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { draftProblem, SCHEDULE_KINDS, weekdayOrder, type ScheduleDraft } from '../utils/schedule'
import { DOT_COLOR, weekdayName } from './MonthCalendar'

interface Props {
  initial: ScheduleDraft
  // An existing item: the form can also delete it
  editing: boolean
  weekStartsOn: number
  busy: boolean
  onSave: (draft: ScheduleDraft) => void
  // Every day of the item
  onDeleteAll?: () => void
  // Only the day it was opened from; given for a repeating item
  onDeleteDay?: () => void
  onClose: () => void
}

// The form for one schedule item: what kind it is, when it is, and on which weekdays it repeats.
// Tapping outside cancels.
export default function ScheduleItemDialog({ initial, editing, weekStartsOn, busy, onSave, onDeleteAll, onDeleteDay, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const set = (change: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...change }))
  const problem = draftProblem(draft)
  const repeats = draft.repeatDays.length > 0
  const toggleDay = (weekday: number) => set({
    repeatDays: draft.repeatDays.includes(weekday) ? draft.repeatDays.filter((d) => d !== weekday) : [...draft.repeatDays, weekday],
  })

  // 16px text, so a phone does not zoom the page when a field is tapped; appearance-none and
  // min-w-0 because a phone's own date and time fields otherwise ignore their width
  const field = 'block w-full min-w-0 max-w-full appearance-none mt-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-base text-white'
  const label = 'block min-w-0 text-sm text-gray-400'
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-600 text-gray-300'}`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t('schedule.editItem') : t('schedule.newItem')}
        className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (!problem && !busy) onSave(draft) }}
      >
        <h2 className="text-lg font-bold mb-3">{editing ? t('schedule.editItem') : t('schedule.newItem')}</h2>

        <div role="group" aria-label={t('schedule.kind')} className="flex flex-wrap gap-2 mb-3">
          {SCHEDULE_KINDS.map((kind) => (
            <button key={kind} type="button" aria-pressed={draft.kind === kind} onClick={() => set({ kind })} className={`${chip(draft.kind === kind)} flex items-center gap-1.5`}>
              <span className={`w-2 h-2 rounded-full ${DOT_COLOR[kind]}`} aria-hidden="true" />
              {t(`schedule.kinds.${kind}`)}
            </button>
          ))}
        </div>

        <label className={label}>
          {t('schedule.itemTitle')}
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} dir="auto" className={field} />
        </label>

        <label className={`${label} mt-3`}>
          {t('schedule.date')}
          <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className={field} />
        </label>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className={label}>
            {t('schedule.start')}
            <input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} className={field} />
          </label>
          <label className={label}>
            {t('schedule.end')}
            <input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} className={field} />
          </label>
        </div>
        {problem === 'times' && <p className="text-sm text-red-400 mt-1">{t('schedule.problems.times')}</p>}

        <p className="text-sm text-gray-400 mt-3 mb-1" id="repeat-label">{t('schedule.repeatOn')}</p>
        <div role="group" aria-labelledby="repeat-label" className="flex flex-wrap gap-1.5">
          {weekdayOrder(weekStartsOn).map((weekday) => (
            <button key={weekday} type="button" aria-pressed={draft.repeatDays.includes(weekday)} onClick={() => toggleDay(weekday)} className={chip(draft.repeatDays.includes(weekday))}>
              {weekdayName(weekday, i18n.language)}
            </button>
          ))}
        </div>
        {repeats && (
          <label className={`${label} mt-3`}>
            {t('schedule.until')}
            <input type="date" value={draft.until} onChange={(e) => set({ until: e.target.value })} className={field} />
          </label>
        )}
        {problem === 'until' && <p className="text-sm text-red-400 mt-1">{t('schedule.problems.until')}</p>}

        <label className={`${label} mt-3`}>
          {t('schedule.note')}
          <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} rows={2} dir="auto" className={field} />
        </label>

        {confirming ? (
          <div className="mt-4">
            <p className="font-semibold mb-3">
              {onDeleteDay ? t('schedule.confirmDeleteRepeating', { title: initial.title }) : t('schedule.confirmDelete', { title: initial.title })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
              {onDeleteDay ? (
                <>
                  <button type="button" onClick={onDeleteDay} disabled={busy} className="flex-1 py-2 bg-red-600 rounded font-semibold disabled:opacity-50">{t('schedule.deleteOne')}</button>
                  <button type="button" onClick={onDeleteAll} disabled={busy} className="flex-1 py-2 bg-red-800 rounded font-semibold disabled:opacity-50">{t('schedule.deleteAll')}</button>
                </>
              ) : (
                <button type="button" onClick={onDeleteAll} disabled={busy} className="flex-1 py-2 bg-red-600 rounded font-semibold disabled:opacity-50">{t('schedule.delete')}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
            {editing && onDeleteAll && (
              <button type="button" onClick={() => setConfirming(true)} className="flex-1 py-2 rounded font-semibold text-red-300 bg-red-900/40 hover:bg-red-900/60">{t('schedule.delete')}</button>
            )}
            <button type="submit" disabled={!!problem || busy} className="flex-1 py-2 bg-blue-600 rounded font-semibold disabled:opacity-50">{t('common.save')}</button>
          </div>
        )}
      </form>
    </div>
  )
}
