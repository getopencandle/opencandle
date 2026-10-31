import {usMarketSession} from './us-market-hours';

/** Startup-only, main-process evidence from the gated keyless transport. Never persisted or accepted from workspace data. */
export interface SyntheticMarketClockSample {scenario:'regular'|'closed';nowMs:number}
export interface SyntheticMarketClock {readonly scenario:SyntheticMarketClockSample['scenario'];now():number}
export const SYNTHETIC_MARKET_EPOCHS=Object.freeze({regular:Date.UTC(2026,9,20,16),closed:Date.UTC(2026,9,21,2)});
const own=(value:unknown,key:string):unknown=>{
 if(!value||typeof value!=='object')return undefined;
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(descriptor&&!('value' in descriptor))throw new Error('Synthetic market clock configuration is invalid.');
 return descriptor?.value;
};
/** A sample must agree with a named fixture, and is anchored to this renderer's monotonic clock at receipt. */
export function readSyntheticMarketClock(status:unknown,elapsedNow:()=>number=()=>performance.now()):SyntheticMarketClock|null{
 const sample=own(status,'syntheticClock');if(sample===undefined)return null;
 if(own(status,'synthetic')!==true||!sample||typeof sample!=='object')throw new Error('Synthetic market clock configuration is invalid.');
 const scenario=own(sample,'scenario'),nowMs=own(sample,'nowMs');
 if((scenario!=='regular'&&scenario!=='closed')||Object.getOwnPropertyNames(sample).length!==2||Object.getOwnPropertySymbols(sample).length!==0||typeof nowMs!=='number'||!Number.isSafeInteger(nowMs)||nowMs<SYNTHETIC_MARKET_EPOCHS[scenario]||nowMs>=SYNTHETIC_MARKET_EPOCHS[scenario]+86400000)throw new Error('Synthetic market clock configuration is invalid.');
 const started=elapsedNow();if(!Number.isFinite(started))throw new Error('Synthetic market clock configuration is invalid.');
 let elapsed=0;
 return Object.freeze({scenario,now:()=>{const current=elapsedNow();if(!Number.isFinite(current))throw new Error('Synthetic market clock is unavailable.');elapsed=Math.max(elapsed,current-started);return nowMs+Math.floor(elapsed);}});
}
export function syntheticMarketClockLabel(clock:SyntheticMarketClock):string{
 const now=clock.now(),phase=usMarketSession(now),name=clock.scenario==='regular'?'Regular session fixture':'Closed session fixture';
 return `SYNTHETIC market clock | ${name} | ${new Date(now).toISOString()} | New York: ${phase==='regular'?'regular session':phase==='extended'?'extended hours':'market closed'}`;
}
