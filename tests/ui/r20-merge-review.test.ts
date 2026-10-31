import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// merge review fixes.
// Source wiring checks of the App root; behavior is covered in the owning modules' tests where it can be driven.
const app=()=>readFileSync('src/ui/App.tsx','utf8');

it('#2 the floating order ticket remounts when the chart instrument or the virtual account/run changes (no stale price, TP or SL)',()=>{
 expect(app()).toContain("<PaperOrderTicket key={paperInstrumentKey(orderSeed.relay?.instrument??dataset.instrument)+'|'+activeAccount.id+'|'+activeAccount.runId} extendedHoursDefault=");
 expect(app()).toMatch(/import \{[^}]*\bpaperInstrumentKey\b[^}]*\} from '\.\.\/domain\/paper-brackets';/);
});

it('#3 a clicked-price paper ticket re-adopts over the floating paper panel or order ticket; list alerts close a floating paper panel instead of refusing',()=>{
 const text=app();
 expect(text).toContain("const FLOATING_PAPER_DIALOGS:ReadonlySet<string>=new Set(['paper','order']);");
 expect(text).toContain("if(dialogOwner.current&&!(action==='paper-ticket'&&FLOATING_PAPER_DIALOGS.has(dialogOwner.current))||workspaceTransaction.current||storageMutation.current)throw new Error('Finish the current dialog or workspace operation first.');");
 expect(text).toContain("if(dialogOwner.current&&!FLOATING_PAPER_DIALOGS.has(dialogOwner.current))throw new Error('Close the current dialog before adding a list alert.');");
 // The replacement is the PaperPanel contextRequest effect (dirty drafts get the visible replacement prompt), not a silent reseed.
 expect(readFileSync('src/ui/PaperPanel.tsx','utf8')).toContain('if(dirty.current||editing||exitEditor||confirmation){const value={request:contextRequest,fingerprint:draftFingerprint()};replacementRef.current=value;setReplacement(value);return;}');
});

it('#4 session shading and breaks use the nominal interval: session-anchored 1h bars (a 09:00-09:30 bucket) still read as 1h',async()=>{
 const {barIntervalMs,nominalBarIntervalMs}=await import('../../src/chart/session-zones');
 // Synthetic New York 2026-10-21 (EDT, UTC-4): 08:00, 09:00 (short pre-market bucket to 09:30), 09:30, 10:30, 11:30.
 const t=(h:number,m=0)=>Date.UTC(2026,9,21,h+4,m)/1000,bars=[t(8),t(9),t(9,30),t(10,30),t(11,30)].map(time=>({time}));
 expect(barIntervalMs(bars)).toBe(1800000);
 expect(nominalBarIntervalMs('60m',bars)).toBe(3600000);
 expect(nominalBarIntervalMs('1h',bars)).toBe(3600000);
 expect(nominalBarIntervalMs(undefined,bars)).toBe(1800000);
 expect(nominalBarIntervalMs('100T',bars)).toBe(1800000);
 expect(nominalBarIntervalMs('not an interval',bars)).toBe(1800000);
 const adapter=readFileSync('src/chart/adapter.ts','utf8');
 expect(adapter).toContain('const basis=sourceAxisBasis(currentSource),interval=nominalBarIntervalMs(currentSource?.resolution,currentBars);');
 expect(adapter).toContain('const interval=nominalBarIntervalMs(currentSource?.resolution,currentBars),first=currentBars[0]?.time');
});

it('#6 in a keyless Alpaca stub run the chart execution labels and the fills table say SYNTHETIC for US stock fills',async()=>{
 const {selectAlpacaSyntheticStub,isAlpacaStubInstrument}=await import('../../src/domain/alpaca-live');
 const {paperExecutionMarksFor}=await import('../../src/ui/PaperExecutionMarks');
 const {paperFillSymbol}=await import('../../src/ui/PaperPanel');
 const us={id:'US:GME',symbol:'GME',exchange:'US',tickSize:0.01},fill={id:'f1',orderId:'o1',instrumentId:'US:GME',side:'buy' as const,quantity:1,price:10,at:100},bars=[{time:60}];
 const account={orders:[{id:'o1',instrument:us}],fills:[fill]} as any;
 try{
  expect(isAlpacaStubInstrument(us)).toBe(false);
  expect(paperExecutionMarksFor([fill] as any,us as any,bars)[0].label).not.toContain('SYNTHETIC');
  expect(paperFillSymbol(account,fill as any)).toBe('GME');
  selectAlpacaSyntheticStub();
  expect(isAlpacaStubInstrument(us)).toBe(true);expect(isAlpacaStubInstrument({exchange:'COINBASE'})).toBe(false);
  expect(paperExecutionMarksFor([fill] as any,us as any,bars)[0].label).toMatch(/ SYNTHETIC$/);
  expect(paperFillSymbol(account,fill as any)).toBe('GME SYNTHETIC');
 }finally{selectAlpacaSyntheticStub(false);}
 expect(readFileSync('src/ui/PaperPanel.tsx','utf8')).toContain('<td>{paperFillSymbol(account, fill)}</td>');
 expect(readFileSync('src/ui/PaperExecutionMarks.tsx','utf8')).toContain('const marks = settings.marks ? paperExecutionMarksFor(account.fills, instrument, props.bars) : [];');
});

it('#7 a bars pattern span fetch on Alpaca folds 15-minute bars for hour targets (Alpaca hour bars start on the clock hour)',async()=>{
 const {barsPatternSpanFetcher}=await import('../../src/chart/lv-types/bars-pattern-resample');
 const {ALPACA_IEX_PROVIDER_ID}=await import('../../src/domain/alpaca-live');
 const calls:string[]=[];
 const fetcher=barsPatternSpanFetcher({alpaca:{fetchAlpacaBars:async(input:any)=>{calls.push(input.timeframe);return{ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:[],nextPageToken:null,provenance:{} as any}} as any;}}});
 for(const resolution of ['60m','240m','15m','1D']){const out=await fetcher({providerId:ALPACA_IEX_PROVIDER_ID,symbol:'GME',resolution,start:0,end:86400});expect(out.resolution).toBe(resolution==='60m'||resolution==='240m'?'15m':resolution);}
 expect(calls).toEqual(['15Min','15Min','15Min','1Day']);
});
