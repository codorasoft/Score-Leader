import { useTranslation } from 'react-i18next'

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  return (
    <button
      onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}
      className="text-xs text-gray-400 hover:text-white border border-gray-600 rounded px-2 py-1 font-mono"
      title={isAr ? 'Switch to English' : 'التبديل للعربية'}
    >
      {isAr ? 'EN' : 'ع'}
    </button>
  )
}
