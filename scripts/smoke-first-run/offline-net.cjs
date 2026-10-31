// Evaluated in the Electron main process by scripts/smoke-first-run.mjs (offline case only), right after launch.
// Every Coinbase request fails as an unreachable network would: REST fetches reject and the public WebSocket never connects.
// Other requests are untouched. Never loaded by the app itself.
const BLOCKED=/(^|\.)coinbase\.com$/i;
const hostOf=input=>{try{return new URL(typeof input==='string'?input:input?.url??String(input)).hostname;}catch{return '';}};
const realFetch=globalThis.fetch;
globalThis.fetch=async function offlineFetch(input,init){
  if(BLOCKED.test(hostOf(input))){await new Promise(resolve=>setTimeout(resolve,150));throw new TypeError('fetch failed (smoke test: network offline)');}
  return realFetch.call(this,input,init);
};
const RealWebSocket=globalThis.WebSocket;
if(typeof RealWebSocket==='function'){
  globalThis.WebSocket=class OfflineWebSocket extends EventTarget{
    constructor(url){
      if(!BLOCKED.test(hostOf(url)))return new RealWebSocket(url);
      super();this.url=String(url);this.readyState=0;
      setTimeout(()=>{this.readyState=3;const error=new Event('error');this.onerror?.(error);this.dispatchEvent(error);const close=Object.assign(new Event('close'),{code:1006,reason:'offline'});this.onclose?.(close);this.dispatchEvent(close);},150);
    }
    send(){throw new Error('offline');}
    close(){this.readyState=3;}
  };
}
globalThis.__opencandleSmokeOffline=true;
process.stderr.write('OpenCandle smoke: Coinbase network is mocked offline in this process.\n');
