import { BackendModule, InitOptions } from 'i18next'

export const fallbackLng = 'en'
export const defaultNS = 'common'
export const cookieName = 'i18next'
export const languages = [fallbackLng, 'de'] as const

export const getOptions = (lng = fallbackLng, ns: InitOptions['ns'] = defaultNS): InitOptions => ({
  lng,
  fallbackLng,
  supportedLngs: languages,
  // Always load the default namespace, as other strings nest from it (e.g. the instance name)
  ns: [...new Set([ns, defaultNS].flat())],
  fallbackNS: defaultNS,
  defaultNS,
  // debug: true,
  interpolation: {
    escapeValue: false,
  },
})

/** Lazily loads translation files from ./locales, only for known languages and namespaces */
export const localesBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: (language, namespace, callback) => {
    if (!(languages as readonly string[]).includes(language) || !/^[a-z-]+$/.test(namespace)) {
      return callback(new Error(`Unsupported language or namespace: ${language}/${namespace}`), false)
    }
    import(`./locales/${language}/${namespace}.json`)
      .then(data => callback(null, data.default ?? data))
      .catch(err => callback(err, false))
  },
}

interface LanguageDetails {
  /** Name of the language in it's own language */
  name: string
  /** 0: Sunday, 1: Monday */
  weekStart: 0 | 1
  timeFormat: '12h' | '24h'
}

export const languageDetails: Record<typeof languages[number], LanguageDetails> = {
  'en': { // English (US)
    name: 'English (US)',
    weekStart: 0,
    timeFormat: '12h',
  },
  'de': { // German
    name: 'Deutsch',
    weekStart: 1,
    timeFormat: '24h',
  }
}
