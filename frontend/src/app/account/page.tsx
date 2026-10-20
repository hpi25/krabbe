import { Metadata } from 'next'

import AccountForm from '/src/components/AccountForm/AccountForm'
import Content from '/src/components/Content/Content'
import Footer from '/src/components/Footer/Footer'
import Header from '/src/components/Header/Header'
import { useTranslation } from '/src/i18n/server'

export const generateMetadata = async (): Promise<Metadata> => {
  const { t } = await useTranslation('account')

  return {
    title: t('name'),
  }
}

const Page = async () => <>
  <Content>
    <Header />
  </Content>

  <Content isSlim>
    <AccountForm />
  </Content>

  <Footer />
</>

export default Page
