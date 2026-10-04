import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText, shareToMessenger } from '../lib/messengerShare'

export function SessionSummaryShare({ text }: { text: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  const share = async () => {
    if ((await shareToMessenger(text)) === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold"
      >
        📤 {t('summary.button')}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="summary-title"
            className="bg-gray-800 rounded-2xl p-5 w-full max-w-md max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="summary-title" className="text-lg font-bold">{t('summary.title')}</h2>
              <button onClick={() => setOpen(false)} aria-label={t('common.cancel')} className="w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-700">✕</button>
            </div>
            <pre className="flex-1 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm bg-gray-900/70 rounded-lg p-3 mb-3">{text}</pre>
            <p className="text-xs text-gray-400 mb-3">{t('summary.help')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copy} className="py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold text-sm">
                {copied ? t('summary.copied') : t('summary.copy')}
              </button>
              <button onClick={share} className="py-3 rounded-xl bg-[#0866FF] hover:bg-[#0756d6] font-semibold text-sm">
                💬 {t('summary.share')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
