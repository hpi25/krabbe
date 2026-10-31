import { useCallback, useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next/TransWithoutContext'
import { Temporal } from '@js-temporal/polyfill'
import { CalendarX, Settings } from 'lucide-react'

import Button from '/src/components/Button/Button'
import { TimeScore } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { allowUrlToWrap, convertTimesToDates, range } from '/src/utils'
import { removeBusyTimes } from '/src/utils/removeBusyTimes'

import styles from './CalendarConflicts.module.scss'
import { CalendarErrorCode, ExtensionCalendar, useExtensionBridge } from '../../useExtensionBridge'

export const EXTENSION_URL = 'https://github.com/hpi25/krabbe/tree/main/browser-extension'

interface CalendarConflictsProps {
  times: string[]
  timezone: string
  eventTimezone?: string
  preferences: TimeScore[]
  onImport: (availability: TimeScore[]) => void
}

interface Result {
  removed?: number
  errors: { name: string, code: CalendarErrorCode }[]
  failed?: boolean
}

/** Removes selected times that clash with the user's CalDAV calendars, via the Krabbe browser extension */
const CalendarConflicts = ({ times, timezone, eventTimezone, preferences, onImport }: CalendarConflictsProps) => {
  const { t, i18n } = useTranslation('event')
  const { status, listCalendars, fetchBusy, openSettings } = useExtensionBridge()

  const modalRef = useRef<HTMLDialogElement>(null)
  const [calendars, setCalendars] = useState<(ExtensionCalendar & { isChecked: boolean })[]>()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<Result>()
  const isWeekly = times[0]?.length !== 13
  const [weeks, setWeeks] = useState(4)
  const [includeCurrentWeek, setIncludeCurrentWeek] = useState(true)

  // Keep latest preferences for the async apply without re-creating it on every change
  const latest = useRef({ preferences, onImport })
  useEffect(() => { latest.current = { preferences, onImport } })

  const open = useCallback(() => {
    setResult(undefined)
    setCalendars(undefined)
    modalRef.current?.showModal()
    // Start from the defaults in the extension settings every time
    listCalendars()
      .then(cals => setCalendars(cals.map(c => ({ ...c, isChecked: c.enabled }))))
      .catch(e => {
        console.error(e)
        modalRef.current?.close()
        setResult({ errors: [], failed: true })
      })
  }, [listCalendars])

  const apply = useCallback(() => {
    if (!calendars) return
    // Weekday times resolve to this week, so shift them by each checked week (in the event timezone to keep wall-clock times)
    const offsets = isWeekly ? range(includeCurrentWeek ? 0 : 1, weeks) : [0]
    const dates = convertTimesToDates(times, timezone, eventTimezone)
    const slots = new Map(times.map((time, i) => [time, offsets.map(w =>
      dates[i].withTimeZone(eventTimezone ?? timezone).add({ weeks: w }).epochMilliseconds
    )]))
    const starts = [...slots.values()].flat()
    setIsLoading(true)
    fetchBusy({
      calendarIds: calendars.filter(c => c.isChecked).map(c => c.id),
      timeStart: Temporal.Instant.fromEpochMilliseconds(Math.min(...starts)).toString(),
      timeEnd: Temporal.Instant.fromEpochMilliseconds(Math.max(...starts)).add({ minutes: 15 }).toString(),
      timezone,
    })
      .then(({ busy, errors }) => {
        const { preferences, onImport } = latest.current
        const remaining = removeBusyTimes(preferences, busy, time => slots.get(time) ?? [])
        onImport(remaining)
        setResult({
          removed: preferences.length - remaining.length,
          errors: errors.map(e => ({ name: calendars.find(c => c.id === e.calendarId)?.name ?? e.calendarId, code: e.code })),
        })
      })
      .catch(e => {
        console.error(e)
        setResult({ errors: [], failed: true })
      })
      .finally(() => {
        setIsLoading(false)
        modalRef.current?.close()
      })
  }, [calendars, fetchBusy, times, timezone, eventTimezone, isWeekly, weeks, includeCurrentWeek])

  if (status === 'checking') return null

  if (status === 'absent') return <p className={styles.hint}>
    <Trans i18nKey="you.integration.extension.missing" t={t} i18n={i18n}>
      _<a href={EXTENSION_URL} target="_blank" rel="noreferrer noopener">_</a>_
    </Trans>
  </p>

  const accounts = [...new Set(calendars?.map(c => c.account))]

  return <>
    <Button onClick={open} title={t('you.integration.extension.button_title')} icon={<CalendarX aria-hidden="true" />}>{t('you.integration.extension.button')}</Button>
    <Button
      isSecondary
      title={t('you.integration.extension.settings_title')}
      onClick={() => openSettings().catch(console.error)}
      icon={<Settings aria-hidden="true" />}
    >{t('you.integration.extension.settings')}</Button>

    {result && <div className={styles.result} role="status">
      {result.failed && <p>{t('you.integration.extension.failed')}</p>}
      {result.removed !== undefined && <p>{t('you.integration.extension.removed', { count: result.removed })}</p>}
      {result.errors.length > 0 && <ul>
        {result.errors.map(e => <li key={e.name}>{e.name}: {t(`you.integration.extension.errors.${e.code}`)}</li>)}
      </ul>}
    </div>}

    <dialog
      ref={modalRef}
      className={styles.modal}
      aria-labelledby="calendar-conflicts-title"
      onClick={e => e.target === modalRef.current && !isLoading && modalRef.current?.close()}
      onCancel={e => isLoading && e.preventDefault()}
    >
      <h2 id="calendar-conflicts-title" className={styles.title}>{t('you.integration.extension.title')}</h2>

      {!calendars && <p className={styles.muted}>{t('you.integration.extension.loading')}</p>}

      {calendars?.length === 0 && <p className={styles.muted}>{t('you.integration.extension.empty')}</p>}

      {calendars && calendars.length > 0 && <>
        <div className={styles.options}>
          {calendars.every(c => c.isChecked)
            ? <button className={styles.linkButton} type="button" onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: false })))}>{t('you.select_none')}</button>
            : <button className={styles.linkButton} type="button" onClick={() => setCalendars(calendars.map(c => ({ ...c, isChecked: true })))}>{t('you.select_all')}</button>}
        </div>
        {accounts.map(account => <fieldset key={account} className={styles.account}>
          {accounts.length > 1 && <legend>{account}</legend>}
          {calendars.filter(c => c.account === account).map(calendar => <div key={calendar.id} className={styles.item}>
            <input
              type="checkbox"
              id={`extension-calendar-${calendar.id}`}
              style={{ accentColor: calendar.color?.slice(0, 7) }}
              checked={calendar.isChecked}
              onChange={() => setCalendars(calendars.map(c => c.id === calendar.id ? { ...c, isChecked: !c.isChecked } : c))}
            />
            <label htmlFor={`extension-calendar-${calendar.id}`}>{allowUrlToWrap(calendar.name)}</label>
          </div>)}
        </fieldset>)}
        {isWeekly && <div className={styles.weeks}>
          <label>
            {t('you.integration.extension.weeks')}
            <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}>
              {range(1, 8).map(n => <option key={n} value={n}>{t('you.integration.extension.weeks_option', { count: n })}</option>)}
            </select>
          </label>
          <div className={styles.item}>
            <input
              type="checkbox"
              id="extension-current-week"
              checked={includeCurrentWeek}
              onChange={() => setIncludeCurrentWeek(!includeCurrentWeek)}
            />
            <label htmlFor="extension-current-week">{t('you.integration.extension.current_week')}</label>
          </div>
          <p className={styles.muted}>{t('you.integration.extension.weeks_info')}</p>
        </div>}
        <p className={styles.muted}>{t('you.integration.extension.info')}</p>
      </>}

      <div className={styles.buttons}>
        <Button isSecondary isSmall disabled={isLoading} onClick={() => modalRef.current?.close()}>
          {t('you.integration.extension.cancel')}
        </Button>
        {calendars?.length === 0
          ? <Button isSmall title={t('you.integration.extension.settings_title')} onClick={() => openSettings().catch(console.error)}>{t('you.integration.extension.settings')}</Button>
          : <Button
            isSmall
            isLoading={isLoading}
            disabled={isLoading || !calendars?.some(c => c.isChecked)}
            onClick={apply}
          >{t('you.integration.extension.confirm')}</Button>}
      </div>
    </dialog>
  </>
}

export default CalendarConflicts
