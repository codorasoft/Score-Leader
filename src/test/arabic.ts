import i18n from 'i18next'
import ar from '../locales/ar.json'

// Run a test with the app in Arabic, then switch back to English for the other tests
export async function inArabic(run: () => Promise<void> | void) {
  if (!i18n.hasResourceBundle('ar', 'translation')) i18n.addResourceBundle('ar', 'translation', ar)
  await i18n.changeLanguage('ar')
  try { await run() } finally { await i18n.changeLanguage('en') }
}
