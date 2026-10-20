import type { BusyInterval } from './calendar/types.ts';
import type { CalendarSettings } from './storage.ts';
import type { Credentials } from './calendar/caldav.ts';

export interface DiscoverRequest {
  type: 'discover';
  creds: Credentials;
}
export interface FetchBusyRequest {
  type: 'fetch-busy';
  calendarUrls: string[];
  timeStart: string;
  timeEnd: string;
  timezone: string;
}
export interface OpenOptionsRequest {
  type: 'open-options';
}
export interface PickerDataRequest {
  type: 'picker-data';
}
export interface SaveSelectionRequest {
  type: 'save-selection';
  calendarUrls: string[];
}
export type Message = DiscoverRequest | FetchBusyRequest | OpenOptionsRequest | PickerDataRequest | SaveSelectionRequest;

export interface PickerCalendar {
  url: string;
  name: string;
  color?: string;
  checked: boolean;
}
export interface PickerGroup {
  label: string;
  calendars: PickerCalendar[];
}
/** The only calendar-related data content scripts ever see: no credentials, no server URLs. */
export interface PickerDataResponse {
  groups: PickerGroup[];
}

export type DiscoverResponse = { calendars: Pick<CalendarSettings, 'url' | 'name' | 'color'>[] } | { error: string };
export interface FetchBusyResponse {
  busy: BusyInterval[];
  errors: { calendarUrl: string; message: string }[];
}
