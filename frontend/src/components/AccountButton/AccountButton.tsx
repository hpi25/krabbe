'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { CircleUser } from 'lucide-react'

import { getMe } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { useStore } from '/src/stores'
import useAccountStore from '/src/stores/accountStore'

import styles from './AccountButton.module.scss'

const AccountButton = () => {
  const { t } = useTranslation('account')

  const session = useStore(useAccountStore, state => state.session)
  const setSession = useAccountStore(state => state.setSession)
  const clearSession = useAccountStore(state => state.clearSession)

  // Check the session is still valid, and pick up display name changes
  const token = session?.token
  useEffect(() => {
    if (!token) return
    getMe(token)
      .then(user => setSession({ token, user }))
      .catch(e => {
        if (e && typeof e === 'object' && 'status' in e && e.status === 401) {
          clearSession()
        }
      })
  }, [token])

  return <Link
    href="/account"
    className={styles.button}
    title={session ? t('signed_in', { name: session.user.display_name, username: session.user.username }) : t('login_title')}
  >
    <CircleUser />
    {session && <span className={styles.username}>@{session.user.username}</span>}
  </Link>
}

export default AccountButton
