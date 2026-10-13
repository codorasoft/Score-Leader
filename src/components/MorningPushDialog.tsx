import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { readPushState, sendTestPush, setPushHour, turnOffPush, turnOnPush, type PushState } from '../lib/push'

interface Props {
  // What this device can do and whether the notification is on (see src/lib/push.ts)
  state: PushState
  // The state after turning on or off, or after a change of hour
  onChange: (state: PushState) => void
  onClose: () => void
}

export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

// The morning notification for this device: its hour, turning it on and off, and a test.
// A device that cannot be turned on is told why. Tapping outside, Escape and Close close it.
export default function MorningPushDialog({ state, onChange, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // The hour in the picker; while on, it is saved as soon as it is changed
  const [hour, setHour] = useState(state.hour)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Focus starts on Close, where Enter does no harm
  useEffect(() => { closeRef.current?.focus() }, [])

  // One request at a time; every control waits while it runs
  const run = async (request: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try { await request() } finally { setBusy(false) }
  }
  const failed = (text: string) => setMessage({ text, ok: false })

  const turnOn = () => run(async () => {
    const result = await turnOnPush(hour, i18n.language)
    // 'dismissed': the browser's question was closed without an answer; nothing changed
    if (result === 'failed') failed(t('push.saveFailed'))
    else if (result !== 'dismissed') onChange(await readPushState())
  })
  const changeHour = (next: number) => {
    setHour(next)
    if (!state.on) return
    run(async () => {
      if (await setPushHour(next, i18n.language)) onChange(await readPushState())
      else {
        setHour(state.hour)
        failed(t('push.saveFailed'))
      }
    })
  }
  const turnOff = () => run(async () => {
    await turnOffPush()
    onChange(await readPushState())
  })
  const test = () => run(async () => {
    if (await sendTestPush()) setMessage({ text: t('push.testSent'), ok: true })
    else failed(t('push.testFailed'))
  })

  // Escape closes; Tab and Shift+Tab wrap inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab' || !boxRef.current) return
    const focusable = [...boxRef.current.querySelectorAll<HTMLElement>('select:not([disabled]), button:not([disabled])')]
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // Why this device cannot be turned on, when it cannot
  const obstacle = state.support === 'unsupported' ? t('push.unsupported')
    : state.support === 'needsInstall' ? t('push.needsInstall')
    : state.permission === 'denied' ? t('push.blocked')
    : null
  const wide = 'w-full py-2.5 rounded-lg font-semibold disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-xl p-5 w-full max-w-sm"
      >
        <h2 id={titleId} className="text-lg font-bold mb-2">{t('push.title')}</h2>

        {obstacle ? (
          <p className="text-sm text-gray-300">{obstacle}</p>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-3">{t('push.intro')}</p>
            <label className="block text-sm text-gray-400 mb-3">
              {t('push.hour')}
              {/* 16px text, so a phone does not zoom the page when the field is tapped */}
              <select
                dir="ltr"
                value={hour}
                disabled={busy}
                onChange={(e) => changeHour(Number(e.target.value))}
                className="block w-full mt-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-base text-white disabled:opacity-50"
              >
                {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </label>

            {state.on ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={test} disabled={busy} className={`${wide} bg-blue-600 hover:bg-blue-500`}>{t('push.test')}</button>
                <button type="button" onClick={turnOff} disabled={busy} className={`${wide} bg-gray-700 hover:bg-gray-600`}>{t('push.turnOff')}</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3">{t('push.titlesShown')}</p>
                <button type="button" onClick={turnOn} disabled={busy} className={`${wide} bg-blue-600 hover:bg-blue-500`}>{t('push.turnOn')}</button>
              </>
            )}
          </>
        )}

        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${message.ok ? 'text-green-400' : 'text-orange-300'}`}>{message.text}</p>
        )}

        <button type="button" ref={closeRef} onClick={onClose} className={`${wide} mt-3 text-gray-300 hover:text-white`}>{t('push.close')}</button>
      </div>
    </div>
  )
}
