import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAdminPath } from '../contexts/LeagueContext'

const STEPS = ['format', 'players', 'teams', 'kickoff'] as const
type Step = (typeof STEPS)[number]

// Where the coach is in setting up a session: format, who is here, teams, kick-off. A step
// already done that can be changed again (who is here) is a link back to it.
export function SetupSteps({ current, sessionId }: { current: Step; sessionId?: string }) {
  const { t } = useTranslation()
  const adminPath = useAdminPath()
  const at = STEPS.indexOf(current)
  return (
    <nav aria-label={t('setup.title')} className="mb-5">
      <ol className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const done = i < at
          const here = i === at
          const label = t(`setup.${step}`)
          const dot = (
            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
              here ? 'bg-blue-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>{done ? '✓' : i + 1}</span>
          )
          const body = (
            <>
              {dot}
              <span className={`text-xs truncate ${here ? 'font-semibold text-white' : 'text-gray-400'} ${here ? '' : 'hidden min-[400px]:inline'}`}>{label}</span>
            </>
          )
          return (
            <li key={step} className={`flex items-center gap-1.5 min-w-0 ${here ? 'flex-[2]' : 'flex-1'}`} aria-current={here ? 'step' : undefined}>
              {done && step === 'players' && sessionId
                ? <Link to={adminPath(`/sessions/${sessionId}/players`)} className="flex items-center gap-1.5 min-w-0 rounded-full hover:text-white">{body}</Link>
                : <span className="flex items-center gap-1.5 min-w-0">{body}</span>}
              {i < STEPS.length - 1 && <span aria-hidden="true" className={`flex-1 h-0.5 min-w-2 rounded ${done ? 'bg-green-600' : 'bg-gray-800'}`} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
