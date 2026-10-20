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
export type Message = DiscoverRequest | FetchBusyRequest | OpenOptionsRequest;

export type DiscoverResponse = { calendars: Pick<CalendarSettings, 'url' | 'name' | 'color'>[] } | { error: string };
export interface FetchBusyResponse {
  busy: BusyInterval[];
  errors: { calendarUrl: string; message: string }[];
}
