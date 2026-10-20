'use client'

import { initReactI18next, useTranslation as useTranslationHook } from 'react-i18next'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import { getOptions, localesBackend } from './options'

i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(localesBackend)
  .init({
    ...getOptions(),
    detection: {
      order: ['htmlTag', 'cookie', 'navigator'],
      caches: ['localStorage', 'cookie'],
      excludeCacheFor: [],
    },
  })

export const useTranslation: typeof useTranslationHook = (ns, options) => useTranslationHook(ns, options)
