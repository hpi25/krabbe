import { Metadata } from 'next'

import Content from '/src/components/Content/Content'
import CreateForm from '/src/components/CreateForm/CreateForm'
import Header from '/src/components/Header/Header'
import { getFrontendUrl } from '/src/config/frontend'
import { useTranslation } from '/src/i18n/server'

import Redirect from './Redirect'

export const generateMetadata = async (): Promise<Metadata> => {
  const { t } = await useTranslation('common')

  return {
    title: t('cta'),
  }
}

/**
 * Used in the browser extension, to be rendered only in an iframe
 */
const Page = async () => <>
  <Content isSlim>
    <Header isFull isSmall />
  </Content>

  <Content isSlim>
    <CreateForm noRedirect frontendUrl={getFrontendUrl()} />
  </Content>

  <Redirect />
</>

export default Page
