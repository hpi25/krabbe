// TODO: Potentially write a simple rust crate that generates these from the OpenAPI spec

import { z } from 'zod'

import { MAXSCORE } from '../utils/star'

// The API url can be relative (e.g. /api) when served from the same domain as the frontend.
// Server-side requests can't resolve a relative url, so API_URL can be set at runtime
// to an absolute url (e.g. http://api:3000/api) that the server uses instead.
const getApiUrl = (path: string) => {
  const base = (typeof window === 'undefined' && process.env.API_URL) || process.env.NEXT_PUBLIC_API_URL || '/api'
  return `${base.replace(/\/+$/, '')}${path}`
}

export const EventInput = z.object({
  name: z.string().optional(),
  times: z.string().array(),
  timezone: z.string(),
})
export type EventInput = z.infer<typeof EventInput>

export const EventUpdateInput = EventInput.partial()
export type EventUpdateInput = z.infer<typeof EventUpdateInput>

export const EventResponse = z.object({
  id: z.string(),
  name: z.string(),
  times: z.string().array(),
  timezone: z.string(),
  created_at: z.number(),
  // Username of the registered user that created the event
  owner: z.string().nullish(),
})
export type EventResponse = z.infer<typeof EventResponse>

// Frontend types for availability. Breaks binary yes/no availability
// represented as the time string into a TimeScore containing the time
// string and the score given to the time. When interfacing with the backend
// the time string and the score are contatenated with a double underscore,
// e.g. '1100-12042021__4' <- the time was scored a 4
export type TimeScore = {
  time: string,
  score: number,
}
export type PersonInput = {
  availability: TimeScore[],
}
export type PersonResponse = {
  /** Unique within the event, `@username` for registered users */
  name: string,
  display_name: string,
  username?: string,
  availability: TimeScore[],
  created_at: number,
}

// Backend types for availability.
export const APIPersonInput = z.object({
  availability: z.string().array(),
})
export type APIPersonInput = z.infer<typeof APIPersonInput>

export const APIPersonResponse = z.object({
  name: z.string(),
  display_name: z.string().optional(),
  username: z.string().nullish(),
  availability: z.string().array(),
  created_at: z.number(),
})
export type APIPersonResponse = z.infer<typeof APIPersonResponse>

// serialize and deserialize TimeScores for the backend
const serializeTimeScore = (ts: TimeScore): string => `${ts.time}__${ts.score}`
const deserializeTimeScore = (ts: string): TimeScore => {
  const [timeStr, scoreStr] = ts.split('__')
  let score = parseInt(scoreStr)
  if (isNaN(score)) {
    // if we can't parse out the score we assume it's the max, enabling
    // backwards-compatibility with prior non-scored availabilities in the database
    score = MAXSCORE
  }
  // clamp to valid range so people can't tamper with the results others see by
  // sending out of bound scores to the API
  const clamped = Math.min(Math.max(score, 0), MAXSCORE)
  return { time: timeStr, score: clamped }
}
const serializePersonInput = (input: PersonInput): APIPersonInput => {
  return { availability: input.availability.map(serializeTimeScore) }
}
export const deserializePersonResponse = (response: APIPersonResponse): PersonResponse => {
  return {
    name: response.name,
    display_name: response.display_name ?? response.name,
    username: response.username ?? undefined,
    availability: response.availability.map(deserializeTimeScore),
    created_at: response.created_at,
  }
}

export const StatsResponse = z.object({
  event_count: z.number(),
  person_count: z.number(),
  version: z.string(),
})
export type StatsResponse = z.infer<typeof StatsResponse>

export const UserResponse = z.object({
  username: z.string(),
  display_name: z.string(),
})
export type UserResponse = z.infer<typeof UserResponse>

export const SessionResponse = z.object({
  token: z.string(),
  user: UserResponse,
})
export type SessionResponse = z.infer<typeof SessionResponse>

export type RegisterInput = {
  username: string
  display_name: string
  password: string
}

/** Credentials sent with a request, a person's password and/or the session token of a logged in user */
interface Auth {
  password?: string
  session?: string
}

const authHeaders = (auth?: Auth) => ({
  ...auth?.password && { Authorization: `Bearer ${btoa(auth.password)}` },
  ...auth?.session && { 'X-Session-Token': auth.session },
})

const get = async <S extends z.ZodType>(url: string, schema: S, auth?: Auth, nextOptions?: NextFetchRequestConfig): Promise<z.infer<S>> => {
  const res = await fetch(getApiUrl(url), {
    headers: authHeaders(auth),
    next: nextOptions,
  })
    .catch(console.warn)
  if (!res?.ok) throw res
  return schema.parse(await res.json())
}

const post = async <S extends z.ZodType>(url: string, schema: S, input: unknown, auth?: Auth, method = 'POST'): Promise<z.infer<S>> => {
  const res = await fetch(getApiUrl(url), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(auth),
    },
    body: JSON.stringify(input),
  })
    .catch(console.warn)
  if (!res?.ok) throw res
  return schema.parse(await res.json())
}

/** For requests that don't return a body */
const send = async (url: string, method: string, auth?: Auth) => {
  const res = await fetch(getApiUrl(url), {
    method,
    headers: authHeaders(auth),
  })
    .catch(console.warn)
  if (!res?.ok) throw res
}

const personUrl = (eventId: string, personName: string) => `/event/${eventId}/people/${encodeURIComponent(personName)}`

// Get
export const getStats = () => get('/stats', StatsResponse, undefined, { revalidate: 60 })
export const getEvent = (eventId: string) => get(`/event/${eventId}`, EventResponse)
export const getPeople = async (eventId: string) => {
  const res = await get(`/event/${eventId}/people`, APIPersonResponse.array())
  return res.map(deserializePersonResponse)
}
export const getPerson = async (eventId: string, personName: string, auth?: Auth) => {
  const res = await get(personUrl(eventId, personName), APIPersonResponse, auth)
  return deserializePersonResponse(res)
}
export const getMe = (session: string) => get('/user/me', UserResponse, { session })

// Post
export const createEvent = (input: EventInput, session?: string) => post('/event', EventResponse, EventInput.parse(input), { session })
export const updateEvent = (eventId: string, input: EventUpdateInput, session: string) => post(`/event/${eventId}`, EventResponse, EventUpdateInput.parse(input), { session }, 'PATCH')
export const deleteEvent = (eventId: string, session: string) => send(`/event/${eventId}`, 'DELETE', { session })
export const updatePerson = async (eventId: string, personName: string, input: PersonInput, auth?: Auth) => {
  const validated_input = APIPersonInput.parse(serializePersonInput(input))
  const res = await post(personUrl(eventId, personName), APIPersonResponse, validated_input, auth, 'PATCH')
  return deserializePersonResponse(res)
}
export const register = (input: RegisterInput) => post('/user/register', SessionResponse, input)
export const login = (username: string, password: string) => post('/user/login', SessionResponse, { username, password })
export const logout = (session: string) => send('/user/logout', 'POST', { session })
