import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ar from './locales/ar.json'

function applyDir(lang: string) {
  const rtl = lang === 'ar'
  document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

const saved = (() => {
  try { return localStorage.getItem('lang') || 'en' } catch { return 'en' }
})()

applyDir(saved)

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: saved,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lang) => {
  try { localStorage.setItem('lang', lang) } catch { /* ignore */ }
  applyDir(lang)
})

export default i18n
