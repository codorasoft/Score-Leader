import { useTranslation } from 'react-i18next'

// Shown while a page's data is on its way: the outline of a page (a title and a few cards)
// gently pulsing, instead of a bare "Loading…". Screen readers still hear "Loading…".
export default function PageSkeleton({ cards = 3 }: { cards?: number }) {
  const { t } = useTranslation()
  const block = 'rounded-xl bg-gray-800 animate-shimmer'
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden="true" className={`${block} h-7 w-2/5`} />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} aria-hidden="true" className={`${block} ${i === 0 ? 'h-36' : 'h-20'}`} />
      ))}
    </div>
  )
}
