import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath } from '../contexts/LeagueContext'

const STEPS = ['format', 'players', 'teams', 'kickoff'] as const
type Step = (typeof STEPS)[number]

// Where the coach is in setting up a session: format, who is here, teams, kick-off. A step
// already done that can be changed again (who is here) is a link back to it. Each name sits
// under its number so all four stay readable on the narrowest phone, in either language.
export function SetupSteps({ current, sessionId }: { current: Step; sessionId?: string }) {
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const at = STEPS.indexOf(current)
  return (
    <nav aria-label={t('setup.title')} className="mb-5">
      <ol className="grid grid-cols-4">
        {STEPS.map((step, i) => {
          const done = i < at
          const here = i === at
          const label = t(`setup.${step}`)
          const body = (
            <>
              <span className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                here ? 'bg-blue-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}>{done ? '✓' : i + 1}</span>
              <span className={`text-[11px] leading-tight text-center ${here ? 'font-semibold text-white' : 'text-gray-400'}`}>{label}</span>
            </>
          )
          return (
            <li key={step} className="relative flex justify-center min-w-0" aria-current={here ? 'step' : undefined}>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true"
                  className={`absolute top-[11px] start-[calc(50%+16px)] -end-[calc(50%-16px)] h-0.5 rounded ${done ? 'bg-green-600' : 'bg-gray-800'}`} />
              )}
              {done && step === 'players' && sessionId
                ? <Link to={adminPath(`/sessions/${sessionId}/players`)} className="flex flex-col items-center gap-1 min-w-0 px-0.5 rounded hover:text-white">{body}</Link>
                : <span className="flex flex-col items-center gap-1 min-w-0 px-0.5">{body}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
