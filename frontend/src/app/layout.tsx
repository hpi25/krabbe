import { Metadata, Viewport } from 'next'
import { Karla } from 'next/font/google'

import AccountButton from '/src/components/AccountButton/AccountButton'
import Egg from '/src/components/Egg/Egg'
import Settings from '/src/components/Settings/Settings'
import TranslateDialog from '/src/components/TranslateDialog/TranslateDialog'
import { getFrontendUrl } from '/src/config/frontend'
import { fallbackLng } from '/src/i18n/options'
import { useTranslation } from '/src/i18n/server'

import './global.css'

const karla = Karla({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#F79E00',
}

export const generateMetadata = async (): Promise<Metadata> => {
  const { t } = await useTranslation('common')

  return {
    metadataBase: new URL(getFrontendUrl()),
    title: {
      absolute: t('name'),
      template: `%s - ${t('name')}`,
    },
    keywords: ['star', 'fit', 'best', 'starfit', 'schedule', 'availability', 'availabilities', 'preferences', 'when2meet', 'doodle', 'meet', 'plan', 'time', 'timezone'],
    description: 'Enter your preferences to find a time that works for everyone!',
    openGraph: {
      title: t('name'),
      description: 'Enter your preferences to find a time that works for everyone!',
      url: '/',
    },
    icons: {
      icon: 'favicon.ico',
      apple: 'logo192.png',
    },
  }
}

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const { resolvedLanguage } = await useTranslation([])

  return <html lang={resolvedLanguage ?? fallbackLng}>
    <body className={karla.className}>
      <Settings />
      <AccountButton />
      <Egg />
      <TranslateDialog />

      {children}

    </body>
  </html>
}

export default RootLayout
