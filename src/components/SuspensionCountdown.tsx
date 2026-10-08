import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { serverNow, serverNowIso } from '../lib/serverClock'
import type { MatchEvent } from '../lib/types'

interface Props {
  event: MatchEvent
  onReturn: () => void
}

export function SuspensionCountdown({ event, onReturn }: Props) {
  const { t } = useTranslation()
  const totalSeconds = (event.suspension_minutes ?? 2) * 60
  const started = event.suspension_started_at ? new Date(event.suspension_started_at).getTime() : serverNow()

  const calcRemaining = () => Math.max(0, totalSeconds - Math.floor((serverNow() - started) / 1000))
  const [remaining, setRemaining] = useState(calcRemaining)

  useEffect(() => {
    const interval = setInterval(() => setRemaining(calcRemaining()), 1000)
    return () => clearInterval(interval)
  })

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  const handleReturnEarly = async () => {
    await supabase
      .from('match_events')
      .update({ suspension_ended_at: serverNowIso() })
      .eq('id', event.id)
    onReturn()
  }

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${remaining === 0 ? 'bg-red-900/60 border border-red-500' : 'bg-gray-700'}`}>
      <div>
        <span className="font-bold text-sm">{event.player_id}</span>
        <span className={`ml-2 font-mono text-sm ${remaining === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
          {remaining === 0 ? t('common.returnNow') : `${mm}:${ss}`}
        </span>
      </div>
      <button
        onClick={handleReturnEarly}
        className="text-xs text-gray-400 hover:text-white ml-2"
      >
        {t('match.returnEarly')}
      </button>
    </div>
  )
}
