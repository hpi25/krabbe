import { useCallback, useEffect, useState } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import Link from 'next/link'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import { getPerson, PersonResponse } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { useStore } from '/src/stores'
import useAccountStore from '/src/stores/accountStore'

import styles from './Login.module.scss'

const defaultValues = {
  username: '',
  password: '',
}

export interface LoginAuth {
  password?: string
  session?: string
}

interface LoginProps {
  eventId?: string
  user: PersonResponse | undefined
  /** `isAutomatic` is set when logged in using the instance account instead of the form */
  onChange: (user: PersonResponse | undefined, auth?: LoginAuth, isAutomatic?: boolean) => void
}

const Login = ({ eventId, user, onChange }: LoginProps) => {
  const { t } = useTranslation('event')

  const session = useStore(useAccountStore, state => state.session)
  const clearSession = useAccountStore(state => state.clearSession)
  // Whether the logged in user chose to enter this event as a guest instead
  const [isGuest, setIsGuest] = useState(false)

  const {
    register,
    handleSubmit,
    setFocus,
    reset,
    setValue,
  } = useForm({ defaultValues })

  const [error, setError] = useState<React.ReactNode>()
  const [isLoading, setIsLoading] = useState(false)

  const focusName = useCallback(() => setFocus('username'), [setFocus])
  useEffect(() => {
    document.addEventListener('focusName', focusName)
    return () => document.removeEventListener('focusName', focusName)
  }, [])

  // Use the instance account if logged in
  useEffect(() => {
    if (!eventId || !session || isGuest || user) return

    getPerson(eventId, `@${session.user.username}`, { session: session.token })
      .then(resUser => onChange(resUser, { session: session.token }, true))
      .catch(e => {
        // The session expired
        if (e && typeof e === 'object' && 'status' in e && e.status === 401) {
          clearSession()
        } else {
          console.warn(e)
        }
      })
  }, [eventId, session, isGuest, user])

  const onSubmit: SubmitHandler<typeof defaultValues> = async ({ username, password }) => {
    if (username.length === 0) {
      focusName()
      return setError(t('form.errors.name_required'))
    }
    if (username.startsWith('@')) {
      focusName()
      return setError(t('form.errors.name_reserved'))
    }

    setIsLoading(true)
    setError(undefined)

    try {
      if (!eventId) throw 'Event ID not set'

      const resUser = await getPerson(eventId, username, { password: password || undefined })
      onChange(resUser, { password: password || undefined })
      reset()
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && e.status === 401) {
        setError(t('form.errors.password_incorrect'))
        setValue('password', '')
      } else {
        setError(t('form.errors.unknown'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return user ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0', flexWrap: 'wrap', gap: '10px' }}>
    <h2 style={{ margin: 0 }}>{t('form.signed_in', { name: user.username ? `${user.display_name} (@${user.username})` : user.name })}</h2>
    {user.username
      ? <Button isSmall onClick={() => {
        setIsGuest(true)
        onChange(undefined)
      }}>{t('form.guest_button')}</Button>
      : <Button isSmall onClick={() => onChange(undefined)}>{t('form.logout_button')}</Button>}
  </div> : <>
    <h2>{t('form.signed_out')}</h2>
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label={t('form.name')}
        type="text"
        isInline
        required
        disabled={!eventId}
        {...register('username')}
      />

      <TextField
        label={t('form.password')}
        type="password"
        isInline
        disabled={!eventId}
        {...register('password')}
      />

      <Button
        type="submit"
        isLoading={isLoading}
        disabled={isLoading || !eventId}
      >{t('form.button')}</Button>
    </form>
    <Error onClose={() => setError(undefined)}>{error}</Error>
    <p className={styles.info}>
      {t('form.info')}
      {' '}
      {session
        ? <a href="#" onClick={e => {
          e.preventDefault()
          setIsGuest(false)
        }}>{t('form.use_account', { username: session.user.username })}</a>
        : <Link href="/account">{t('form.account_hint')}</Link>}
    </p>
  </>
}

export default Login
