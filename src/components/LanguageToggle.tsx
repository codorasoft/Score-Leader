import { useTranslation } from 'react-i18next'

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  return (
    <button
      onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}
      className="h-9 min-w-9 px-2 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg font-mono"
      title={isAr ? 'Switch to English' : 'التبديل للعربية'}
    >
      {isAr ? 'EN' : 'ع'}
    </button>
  )
}
