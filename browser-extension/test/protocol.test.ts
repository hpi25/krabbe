import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageMessage, parseRequest, sanitizeReply } from '../src/protocol.ts';

test('parsePageMessage ignores other sources, missing request ids and unknown types', () => {
  assert.equal(parsePageMessage({ source: 'krabbe-extension', requestId: '1', type: 'hello' }), null);
  assert.equal(parsePageMessage({ source: 'krabbe', type: 'hello' }), null);
  assert.equal(parsePageMessage({ source: 'krabbe', requestId: '1', type: 'discover' }), null);
  assert.equal(parsePageMessage('hello'), null);
  assert.deepEqual(parsePageMessage({ source: 'krabbe', requestId: '1', type: 'hello', extra: 1 }), {
    requestId: '1',
    request: { type: 'hello' },
  });
});

test('parseRequest validates fetch-busy and strips extras', () => {
  const ok = { type: 'fetch-busy', calendarIds: ['a'], timeStart: 's', timeEnd: 'e', timezone: 'UTC', evil: true };
  assert.deepEqual(parseRequest(ok), { type: 'fetch-busy', calendarIds: ['a'], timeStart: 's', timeEnd: 'e', timezone: 'UTC' });
  assert.equal(parseRequest({ ...ok, calendarIds: [1] }), null);
  assert.equal(parseRequest({ ...ok, calendarIds: 'a' }), null);
  assert.equal(parseRequest({ ...ok, timezone: undefined }), null);
});

test('sanitizeReply strips everything but start/end from busy intervals', () => {
  const r = sanitizeReply('fetch-busy', {
    ok: true,
    data: {
      busy: [{ start: 1, end: 2, summary: 'Dentist', location: 'Secret' }, { start: 'x', end: 3 }],
      errors: [{ calendarId: 'c', code: 'auth', message: 'https://secret.example returned 401' }, { calendarId: 'd', code: 'weird' }],
      stats: [{ calendarId: 'c', events: 3, intervals: 2, names: ['Dentist'] }],
      url: 'https://secret.example',
    },
  });
  assert.deepEqual(r, {
    ok: true,
    data: {
      busy: [{ start: 1, end: 2 }],
      errors: [{ calendarId: 'c', code: 'auth' }, { calendarId: 'd', code: 'unknown' }],
      stats: [{ calendarId: 'c', events: 3, intervals: 2 }],
    },
  });
});

test('sanitizeReply strips urls and credentials from calendars', () => {
  const r = sanitizeReply('list-calendars', {
    ok: true,
    data: { calendars: [{ id: 'c', name: 'Work', color: '#f00', account: 'Me', enabled: true, url: 'https://x/', password: 'p' }, { id: 1 }] },
  });
  assert.deepEqual(r, { ok: true, data: { calendars: [{ id: 'c', name: 'Work', color: '#f00', account: 'Me', enabled: true }] } });
});

test('sanitizeReply turns junk into internal errors and keeps known error codes', () => {
  assert.deepEqual(sanitizeReply('hello', undefined), { ok: false, error: 'internal' });
  assert.deepEqual(sanitizeReply('hello', { ok: true, data: { version: 'one' } }), { ok: false, error: 'internal' });
  assert.deepEqual(sanitizeReply('fetch-busy', { ok: false, error: 'invalid-range' }), { ok: false, error: 'invalid-range' });
  assert.deepEqual(sanitizeReply('fetch-busy', { ok: false, error: 'Error at https://secret' }), { ok: false, error: 'internal' });
});
