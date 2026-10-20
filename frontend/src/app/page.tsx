import { Suspense } from 'react'
import { Trans } from 'react-i18next/TransWithoutContext'
import Link from 'next/link'

import Content from '/src/components/Content/Content'
import CreateForm from '/src/components/CreateForm/CreateForm'
import DownloadButtons from '/src/components/DownloadButtons/DownloadButtons'
import Footer from '/src/components/Footer/Footer'
import Header from '/src/components/Header/Header'
import { P } from '/src/components/Paragraph/Text'
import Recents from '/src/components/Recents/Recents'
import Section from '/src/components/Section/Section'
import Stats from '/src/components/Stats/Stats'
import { getFrontendUrl } from '/src/config/frontend'
import { useTranslation } from '/src/i18n/server'

const Page = async () => {
  const { t, i18n } = await useTranslation('home')

  return <>
    <Content>
      <Header isFull />
    </Content>

    <Recents />

    <Content>
      <CreateForm frontendUrl={getFrontendUrl()} />
    </Content>

    <Section id="about">
      <Content>
        <h2>{t('about.name')}</h2>

        <Suspense>
          <Stats />
        </Suspense>

        <P><Trans i18nKey="about.content.p1" t={t} i18n={i18n}>_<a href="https://starvoting.org/star" target="_blank" rel="noreferrer noopener">_</a>_<br /><Link href="/how-to" rel="help">_</Link>_</Trans></P>
        <P><Trans i18nKey="about.content.p3" t={t} i18n={i18n}>_<a href="https://github.com/drinkablebreeze/starbestfit.com" target="_blank" rel="noreferrer noopener">_</a>_</Trans></P>

        <DownloadButtons />

        <P><Trans i18nKey="about.content.p4" t={t} i18n={i18n}>_<a href="https://github.com/hpi25/krabbe" target="_blank" rel="noreferrer noopener">_</a>_</Trans></P>
        <P>{t('about.content.p6')}</P>
      </Content>
    </Section>

    <Footer />
  </>
}

export default Page
