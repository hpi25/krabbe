import { cookies, headers } from 'next/headers'
import { createInstance } from 'i18next'

import { cookieName, fallbackLng, getOptions, languages, localesBackend } from './options'

/** Pick the best supported language for an Accept-Language header, preferring quality then specificity */
const matchAcceptLanguage = (header: string | null) => {
  if (!header) return undefined

  const matches = header.split(',').flatMap(range => {
    const [tag, quality] = range.trim().split(';')
    const [language, ...subtags] = tag.trim().toLowerCase().split('-')
    if (!/^[a-z]{2,3}$/.test(language)) return []

    return languages.flatMap(supported => {
      const [supportedLanguage, supportedRegion] = supported.toLowerCase().split('-')
      if (supportedLanguage !== language) return []
      // A supported regional variant only matches a request for that region
      if (supportedRegion && !subtags.includes(supportedRegion)) return []
      return [{
        language: supported,
        quality: quality ? parseFloat(quality.split('=')[1]) : 1,
        unmatchedSubtags: subtags.length - (supportedRegion ? 1 : 0),
      }]
    })
  })

  return matches
    .sort((a, b) => (b.quality - a.quality) || (a.unmatchedSubtags - b.unmatchedSubtags))
    .at(0)?.language
}

const initI18next = async (language: string, ns: string | string []) => {
  const i18nInstance = createInstance()
  await i18nInstance
    .use(localesBackend)
    .init(getOptions(language, ns))
  return i18nInstance
}

export const useTranslation = async (ns: string | string[], options: { keyPrefix?: string } = {}) => {
  const language = (await cookies()).get(cookieName)?.value
    ?? matchAcceptLanguage((await headers()).get('Accept-Language'))
    ?? fallbackLng

  const i18nextInstance = await initI18next(language, ns)
  return {
    t: i18nextInstance.getFixedT(language, Array.isArray(ns) ? ns[0] : ns, options.keyPrefix),
    i18n: i18nextInstance,
    resolvedLanguage: language,
  }
}
