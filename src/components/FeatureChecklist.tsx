import { useTranslation } from 'react-i18next'
import { FEATURES, FEATURE_NEEDS, setFeature, type FeatureKey } from '../lib/features'

interface Props {
  value: FeatureKey[]
  onChange: (value: FeatureKey[]) => void
}

export default function FeatureChecklist({ value, onChange }: Props) {
  const { t } = useTranslation()
  const btn = 'px-3 py-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white text-xs'
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button type="button" className={btn} onClick={() => onChange(FEATURES.reduce((l, f) => setFeature(l, f, true), [] as FeatureKey[]))}>
          {t('features.selectAll')}
        </button>
        <button type="button" className={btn} onClick={() => onChange([])}>{t('features.none')}</button>
      </div>
      <ul className="divide-y divide-gray-800 rounded-lg bg-gray-800/50">
        {FEATURES.map((key) => {
          const needed = FEATURE_NEEDS[key]
          return (
            <li key={key}>
              <label className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={value.includes(key)}
                  onChange={(e) => onChange(setFeature(value, key, e.target.checked))}
                />
                <span className="flex-1">{t(`features.${key}`)}</span>
                {needed && <span className="text-xs text-gray-500">{t('features.needs', { feature: t(`features.${needed}`) })}</span>}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
