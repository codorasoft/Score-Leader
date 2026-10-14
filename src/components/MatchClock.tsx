import { useTranslation } from 'react-i18next'
import { formatMatchClock } from '../utils/matchClock'

// The period's clock, with added time below it once the period's length has passed
export function MatchClock({ elapsed, periodSeconds, showButtons, running, onStart, onPause }: {
  elapsed: number
  periodSeconds: number
  // Not shown between periods, where Start would restart the ended period's clock, nor once the match is over
  showButtons: boolean
  running: boolean
  onStart: () => void
  onPause: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="text-5xl font-mono font-bold">
        {formatMatchClock(Math.min(elapsed, periodSeconds), periodSeconds)}
        {periodSeconds > 0 && elapsed > periodSeconds && (
          <span className="block text-2xl text-red-400 mt-1">+{formatMatchClock(elapsed - periodSeconds, periodSeconds)}</span>
        )}
      </div>
      {showButtons && (
        <div className="mt-2 flex justify-center gap-3">
          {!running ? (
            <button onClick={onStart} className="px-4 py-2 bg-green-600 rounded font-semibold">{t('match.start')}</button>
          ) : (
            <button onClick={onPause} className="px-4 py-2 bg-yellow-600 rounded font-semibold">{t('match.pause')}</button>
          )}
        </div>
      )}
    </>
  )
}
