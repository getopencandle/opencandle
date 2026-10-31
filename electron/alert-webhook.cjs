'use strict';
// The only path by which an alert trigger reaches a webhook. LV-local policy: the URL must name this computer
// (localhost, 127.0.0.1 or ::1) over http or https, with no user name or password, so a trigger never leaves the machine
// (no hosted delivery, no telemetry). The body is the alert message: application/json when the
// message parses as JSON, otherwise text/plain. The X-OpenCandle-Alert header says local, replay, synthetic or test (test is the dialog's Send test). One POST, 5 s timeout, no retries, no redirects followed.
const validation = require('./validation.cjs');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
function loopbackUrl(text) {
  if (typeof text !== 'string' || !text || text.length > 2048) return null;
  let url; try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || !LOOPBACK.has(url.hostname.toLowerCase())) return null;
  return url;
}
function alertWebhookInput(value) {
  validation.exactKeys(value, ['url', 'body', 'contentType', 'origin']);
  const url = loopbackUrl(value.url);
  if (!url) throw new validation.BoundaryError('INVALID_ARGUMENT', 'Webhook URLs must point to this computer (localhost, 127.0.0.1 or ::1).');
  if (typeof value.body !== 'string' || value.body.length > 8000) throw new validation.BoundaryError('INVALID_ARGUMENT', 'Invalid webhook body.');
  if (value.contentType !== 'application/json' && value.contentType !== 'text/plain') throw new validation.BoundaryError('INVALID_ARGUMENT', 'Invalid webhook content type.');
  if (!['local', 'replay', 'synthetic', 'test'].includes(value.origin)) throw new validation.BoundaryError('INVALID_ARGUMENT', 'Invalid webhook origin.');
  return { url: url.href, body: value.body, contentType: value.contentType, origin: value.origin };
}
async function postAlertWebhook(input, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return { delivered: false, status: 0, error: 'Webhook delivery is unavailable in this environment.' };
  try {
    const response = await fetchImpl(input.url, { method: 'POST', headers: { 'Content-Type': input.contentType + '; charset=utf-8', 'X-OpenCandle-Alert': input.origin }, body: input.body, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return { delivered: response.status >= 200 && response.status < 300, status: response.status, error: null };
  } catch (error) {
    return { delivered: false, status: 0, error: error && error.name === 'TimeoutError' ? 'The webhook did not answer within 5 seconds.' : 'The webhook could not be reached.' };
  }
}
module.exports = { alertWebhookInput, postAlertWebhook, loopbackUrl };
