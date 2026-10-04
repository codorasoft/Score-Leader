import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionHistoryRow } from '../utils/playerHistory'

// Categorical slots 1–2 of the reference palette, dark steps; validated on the gray-800 card surface.
const GOALS = '#3987e5'
const ASSISTS = '#d95926'
const PLOT_HEIGHT = 140

const shortDate = (iso: string, lang: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' })

export function PlayerFormChart({ rows }: { rows: SessionHistoryRow[] }) {
  const { t, i18n } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...rows.map((r) => r.goals + r.assists))
  const px = (n: number) => (n / max) * PLOT_HEIGHT

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-gray-300 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: GOALS }} />{t('profile.goals')}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: ASSISTS }} />{t('profile.assists')}</span>
      </div>

      <div className="relative overflow-x-auto pt-4" dir="ltr">
        <div className="relative min-w-full w-max" style={{ height: PLOT_HEIGHT }}>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-700" />
          <span className="absolute top-0 left-0 -translate-y-full text-[10px] text-gray-500 pb-0.5">{max}</span>
          <div className="absolute inset-x-0 bottom-0 border-t border-gray-600" />

          <div className="relative flex items-end gap-1.5 h-full px-1">
            {rows.map((r, i) => {
              const g = px(r.goals)
              const a = px(r.assists)
              return (
                <button
                  key={r.sessionId}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(active === i ? null : i)}
                  aria-label={`${r.date}: ${t('profile.tooltip', { goals: r.goals, assists: r.assists })}`}
                  className={`relative h-full flex flex-col justify-end items-center w-5 sm:w-7 flex-none rounded-t ${active === i ? 'bg-white/5' : ''}`}
                >
                  {a > 0 && (
                    <span className="w-3 sm:w-4 rounded-t" style={{ height: a, background: ASSISTS, marginBottom: g > 0 ? 2 : 0 }} />
                  )}
                  {g > 0 && (
                    <span className={`w-3 sm:w-4 ${a > 0 ? '' : 'rounded-t'}`} style={{ height: g, background: GOALS }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-1">
          <span>{rows[0] && shortDate(rows[0].date, i18n.language)}</span>
          <span>{rows.length > 1 && shortDate(rows[rows.length - 1].date, i18n.language)}</span>
        </div>
      </div>

      <div className="h-5 mt-1 text-xs text-gray-300" aria-live="polite">
        {active !== null && rows[active] && (
          <>
            <span className="text-gray-400">{shortDate(rows[active].date, i18n.language)}: </span>
            {t('profile.tooltip', { goals: rows[active].goals, assists: rows[active].assists })}
          </>
        )}
      </div>
    </div>
  )
}
