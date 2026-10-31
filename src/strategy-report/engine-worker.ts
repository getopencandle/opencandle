import { handleEngineRequest, type EngineRequest } from './engine-thread';
import { engineFeedFor } from './feedback';

// L5b: trusted LV engine code only (the same runReportJob the report worker runs). User scripts stay in the restricted
// QuickJS worker; no user code or source URLs enter here.
const port = globalThis as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EngineRequest>) => void): void;
};
port.addEventListener('message', event => { const { reply, transfer } = handleEngineRequest(event.data, engineFeedFor); port.postMessage(reply, transfer); });
