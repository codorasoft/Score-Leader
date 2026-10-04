import '@testing-library/jest-dom'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'

// Initialize i18next once for all component tests
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}
