import { useTranslation } from 'react-i18next'

interface Props {
  // The first row has no "up", the last no "down"
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  disabled?: boolean
}

// Up / down buttons that move a row one place in an ordered list.
export default function MoveButtons({ canUp, canDown, onUp, onDown, disabled }: Props) {
  const { t } = useTranslation()
  const btn = 'w-9 h-9 rounded-lg bg-gray-700 text-gray-300 hover:text-white disabled:opacity-50'
  return (
    <span className="flex gap-1 shrink-0">
      {canUp && (
        <button type="button" onClick={onUp} disabled={disabled} aria-label={t('training.moveUp')} title={t('training.moveUp')} className={btn}>
          <span aria-hidden="true">▲</span>
        </button>
      )}
      {canDown && (
        <button type="button" onClick={onDown} disabled={disabled} aria-label={t('training.moveDown')} title={t('training.moveDown')} className={btn}>
          <span aria-hidden="true">▼</span>
        </button>
      )}
    </span>
  )
}
