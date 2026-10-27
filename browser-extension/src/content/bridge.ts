import { ext } from '../platform.ts';
import { EXTENSION_SOURCE, PROTOCOL_VERSION, parsePageMessage, sanitizeReply, type BackgroundMessage } from '../protocol.ts';

// Runs in every permitted Krabbe tab. It only relays: page → background → page,
// and passes every reply through sanitizeReply so the page sees nothing but protocol fields.

const post = (message: Record<string, unknown>) => window.postMessage({ source: EXTENSION_SOURCE, ...message }, location.origin);

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const parsed = parsePageMessage(e.data);
  if (!parsed) return;
  const { requestId, request } = parsed;
  const message: BackgroundMessage = { channel: 'krabbe-bridge', request };
  ext.runtime
    .sendMessage(message)
    .then(
      (reply: unknown) => sanitizeReply(request.type, reply),
      () => sanitizeReply(request.type, null),
    )
    .then((reply) => post({ type: 'response', requestId, ...reply }));
});

// The page may have said hello before we loaded; tell it we're here.
post({ type: 'present', version: PROTOCOL_VERSION });
