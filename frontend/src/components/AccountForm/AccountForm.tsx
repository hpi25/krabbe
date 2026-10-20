'use client'

import { useState } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import ToggleField from '/src/components/ToggleField/ToggleField'
import { login, logout, register as registerUser } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { useStore } from '/src/stores'
import useAccountStore from '/src/stores/accountStore'

import styles from './AccountForm.module.scss'

const defaultValues = {
  username: '',
  display_name: '',
  password: '',
}

const AccountForm = () => {
  const { t } = useTranslation('account')
  const router = useRouter()

  const session = useStore(useAccountStore, state => state.session)
  const setSession = useAccountStore(state => state.setSession)
  const clearSession = useAccountStore(state => state.clearSession)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<React.ReactNode>()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, setValue } = useForm({ defaultValues })

  const onSubmit: SubmitHandler<typeof defaultValues> = async ({ username, display_name, password }) => {
    setError(undefined)

    if (mode === 'register') {
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
        return setError(t('errors.username_invalid'))
      }
      if (display_name.trim().length === 0) {
        return setError(t('errors.display_name_required'))
      }
      if (password.length < 8) {
        return setError(t('errors.password_short'))
      }
    }

    setIsLoading(true)
    try {
      setSession(mode === 'register'
        ? await registerUser({ username, display_name, password })
        : await login(username, password))
      // Return to the event the user came from
      if (window.history.length > 1) router.back()
      else router.push('/')
    } catch (e) {
      const status = e && typeof e === 'object' && 'status' in e ? e.status : undefined
      if (status === 401) {
        setError(t('errors.login_incorrect'))
        setValue('password', '')
      } else if (status === 409) {
        setError(t('errors.username_taken'))
      } else {
        setError(t('errors.unknown'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (session) return <div className={styles.wrapper}>
    <h2>{t('signed_in', { name: session.user.display_name, username: session.user.username })}</h2>
    <p>{t('signed_in_info')}</p>
    <Button
      isLoading={isLoading}
      onClick={async () => {
        setIsLoading(true)
        await logout(session.token).catch(console.warn)
        clearSession()
        setIsLoading(false)
      }}
    >{t('logout_button')}</Button>
  </div>

  return <div className={styles.wrapper}>
    <h2>{mode === 'login' ? t('login_title') : t('register_title')}</h2>
    <p>{t('info')}</p>

    <ToggleField
      name="accountMode"
      options={{
        login: t('login_button'),
        register: t('register_button'),
      }}
      value={mode}
      onChange={m => {
        setMode(m)
        setError(undefined)
      }}
    />

    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label={t('username')}
        description={mode === 'register' ? t('username_description') : undefined}
        type="text"
        autoComplete="username"
        required
        {...register('username')}
      />

      {mode === 'register' && <TextField
        label={t('display_name')}
        description={t('display_name_description')}
        type="text"
        autoComplete="nickname"
        required
        {...register('display_name')}
      />}

      <TextField
        label={t('password')}
        type="password"
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        required
        {...register('password')}
      />

      <Error onClose={() => setError(undefined)}>{error}</Error>

      <Button
        type="submit"
        isLoading={isLoading}
        disabled={isLoading}
      >{mode === 'login' ? t('login_button') : t('register_button')}</Button>
    </form>
  </div>
}

export default AccountForm
