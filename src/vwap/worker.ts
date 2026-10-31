import { calculateVwapWorkerMessage } from './worker-core';
import { errorText, VwapError } from './protocol';

const port = globalThis as unknown as { postMessage(value: unknown, transfer?: Transferable[]): void; onmessage: ((event: MessageEvent) => void) | null };
let started = false;
port.onmessage = event => {
  if (started) { port.postMessage({ v: 1, type: 'error', code: 'VWAP_PROTOCOL', message: 'A VWAP worker accepts one owned calculation.' }); return; }
  started = true;
  try { const result = calculateVwapWorkerMessage(event.data); port.postMessage(result, [result.values, result.mask]); }
  catch (cause) { port.postMessage({ v: 1, type: 'error', code: cause instanceof VwapError ? cause.code : 'VWAP_WORKER', message: errorText(cause) }); }
};
port.postMessage({ v: 1, type: 'ready' });
