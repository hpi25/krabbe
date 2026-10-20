'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import Button from '/src/components/Button/Button'
import CreateForm from '/src/components/CreateForm/CreateForm'
import Error from '/src/components/Error/Error'
import { deleteEvent, EventResponse } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { useStore } from '/src/stores'
import useAccountStore from '/src/stores/accountStore'
import useRecentsStore from '/src/stores/recentsStore'

import styles from './page.module.scss'

interface EventOwnerControlsProps {
  event: EventResponse
  frontendUrl: string
}

/** Lets the registered user that created an event change or delete it */
const EventOwnerControls = ({ event, frontendUrl }: EventOwnerControlsProps) => {
  const { t } = useTranslation('event')
  const router = useRouter()

  const session = useStore(useAccountStore, state => state.session)
  const removeRecent = useRecentsStore(state => state.removeRecent)

  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<React.ReactNode>()

  if (!session || !event.owner || session.user.username !== event.owner) return null

  return <div className={styles.noPrint}>
    <div className={styles.ownerControls}>
      <Button isSmall isSecondary onClick={() => setIsEditing(!isEditing)}>
        {isEditing ? t('owner.cancel_button') : t('owner.edit_button')}
      </Button>
      <Button
        isSmall
        isSecondary={!isConfirmingDelete}
        isLoading={isDeleting}
        onClick={async () => {
          if (!isConfirmingDelete) return setIsConfirmingDelete(true)

          setIsDeleting(true)
          setError(undefined)
          try {
            await deleteEvent(event.id, session.token)
            removeRecent(event.id)
            router.push('/')
          } catch (e) {
            console.warn(e)
            setError(t('owner.errors.delete'))
            setIsDeleting(false)
            setIsConfirmingDelete(false)
          }
        }}
        onBlur={() => setIsConfirmingDelete(false)}
      >
        {isConfirmingDelete ? t('owner.delete_confirm') : t('owner.delete_button')}
      </Button>
    </div>

    <Error onClose={() => setError(undefined)}>{error}</Error>

    {isEditing && <CreateForm
      event={event}
      frontendUrl={frontendUrl}
      onSaved={() => {
        setIsEditing(false)
        router.refresh()
      }}
    />}
  </div>
}

export default EventOwnerControls
