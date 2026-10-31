import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartEventMarkers,CHART_EVENTS_MAX_RETRIES,CHART_EVENTS_RETRY_MS,chartEventsDiagnostic,type ChartEventMarkersProps} from '../../src/ui/ChartEventMarkers';
import type {ChartEventsResult,CorporateActionEvent} from '../../src/domain/chart-events';

// The markers layer under controlled hooks (effects run with cleanups, fake timers). It reports what it is
// doing in data-lv-chart-events-state (loading, ok, empty, error:<CODE>), sends a failed load to the status line once, and
// tries again instead of staying blank. Synthetic events only; no bridge, no network.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:new Map<number,()=>void>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.cleanups.get(i)?.();hooks.cleanups.delete(i);hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.cleanups.set(i,cleanup);}}
};});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const DAY=86400,first=Date.UTC(2026,0,5,5)/1000;
/** 100 daily bars from 2026-01-05 (New York midnight, EST). */
const bars=Array.from({length:100},(_,i)=>({time:first+i*DAY}));
const dividend=(exDate:string):CorporateActionEvent=>({id:'SYNTHETIC-DIV-'+exDate,kind:'cash-dividend',symbol:'GME',exDate,recordDate:null,payableDate:null,processDate:null,amount:0.14,currency:'USD',special:false,foreign:false} as CorporateActionEvent);
const ok=(events:CorporateActionEvent[]):ChartEventsResult=>({ok:true,value:{schemaVersion:1,symbol:'GME',events,retrievedAt:'2026-10-22T00:00:00.000Z',cached:false,stale:false,synthetic:true,provenance:{provider:'SYNTHETIC Alpaca stub (invented events)',kind:'owner-key',source:'corporate-actions',license:'test'}}} as ChartEventsResult);
function mount(extra:Partial<ChartEventMarkersProps>&{load:ChartEventMarkersProps['load']}){
 hooks.cells=[];hooks.cursor=0;hooks.cleanups.clear();
 const props:ChartEventMarkersProps={symbol:'GME',bars,settings:{dividends:true,splits:true},synthetic:true,
  projection:()=>({left:100,top:50,width:800,height:400}),timeToX:seconds=>100+(seconds-first)/DAY*8,...extra};
 const render=()=>{hooks.cursor=0;return ChartEventMarkers(props) as any;};
 const settle=async()=>{render();await flush();render();await flush();return render();};
 return{props,render,settle};
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{for(const cleanup of hooks.cleanups.values())cleanup();hooks.cleanups.clear();vi.useRealTimers();vi.unstubAllGlobals();});

it('loading, then ok: the host element carries the state, the counts and one SYNTHETIC badge per dividend on the loaded bars',async()=>{
 let answer!:(value:ChartEventsResult)=>void;
 const load=vi.fn(()=>new Promise<ChartEventsResult>(resolve=>{answer=resolve;}));
 const ui=mount({load});
 const waiting=ui.render();
 expect(waiting.props['data-lv-chart-events-state']).toBe('loading');
 expect(waiting.props['data-lv-chart-events']).toBe(0);
 expect(waiting.props['aria-hidden']).toBe(true);
 answer(ok([dividend('2026-02-16'),dividend('2026-03-16'),dividend('2025-11-17')]));
 const shown=await ui.settle();
 expect(shown.props['data-lv-chart-events-state']).toBe('ok');
 expect(shown.props['data-lv-chart-events-total']).toBe(3);
 expect(shown.props['data-lv-chart-events-markers']).toBe(2);
 expect(shown.props['data-lv-chart-events']).toBe(2);
 expect(shown.props.role).toBe('group');expect(shown.props['aria-label']).toBe('SYNTHETIC splits and dividends');
 const badges=shown.props.children[0];
 expect(badges.map((badge:any)=>badge.props['data-lv-chart-event'])).toEqual(['dividend','dividend']);
 expect(badges.every((badge:any)=>/^SYNTHETIC Dividend/.test(badge.props['aria-label']))).toBe(true);
 expect(load).toHaveBeenCalledTimes(1);
});

it('a failed load says error:<CODE>, tells the status line once in plain words, and is tried again until it loads',async()=>{
 const results:ChartEventsResult[]=[{ok:false,error:{code:'BUSY',message:'Too many Alpaca requests are queued.'}},{ok:false,error:{code:'BUSY',message:'Too many Alpaca requests are queued.'}},ok([dividend('2026-02-16')])];
 const load=vi.fn(async()=>results.shift()!),onDiagnostic=vi.fn();
 const ui=mount({load,onDiagnostic});
 const failed=await ui.settle();
 expect(failed.props['data-lv-chart-events-state']).toBe('error:BUSY');
 expect(failed.props.title).toBe('Splits and dividends for GME did not load: Too many Alpaca requests are queued (BUSY).');
 expect(onDiagnostic.mock.calls).toEqual([['Splits and dividends for GME did not load: Too many Alpaca requests are queued (BUSY).']]);
 await vi.advanceTimersByTimeAsync(CHART_EVENTS_RETRY_MS);await ui.settle();
 expect(load).toHaveBeenCalledTimes(2);
 expect(ui.render().props['data-lv-chart-events-state']).toBe('error:BUSY');
 expect(onDiagnostic,'the same failure is reported once').toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(CHART_EVENTS_RETRY_MS);const loaded=await ui.settle();
 expect(load).toHaveBeenCalledTimes(3);
 expect(loaded.props['data-lv-chart-events-state']).toBe('ok');
 expect(loaded.props['data-lv-chart-events']).toBe(1);
});

it('retries stop after the limit; a new chart source tries again; a rejected bridge call is an error too',async()=>{
 const load=vi.fn(async():Promise<ChartEventsResult>=>{throw new Error('IPC closed');}),onDiagnostic=vi.fn();
 const ui=mount({load,onDiagnostic,sourceKey:'live:alpaca-stub:GME:1m'});
 expect((await ui.settle()).props['data-lv-chart-events-state']).toBe('error:FAILED');
 expect(onDiagnostic.mock.calls[0][0]).toBe('Splits and dividends for GME did not load: IPC closed (FAILED).');
 for(let i=0;i<CHART_EVENTS_MAX_RETRIES+2;i++){await vi.advanceTimersByTimeAsync(CHART_EVENTS_RETRY_MS);await ui.settle();}
 expect(load).toHaveBeenCalledTimes(1+CHART_EVENTS_MAX_RETRIES);
 load.mockImplementation(async()=>ok([dividend('2026-02-16')]));
 ui.props.sourceKey='live:alpaca-stub:GME:1D';
 expect((await ui.settle()).props['data-lv-chart-events-state']).toBe('ok');
 expect(load).toHaveBeenCalledTimes(2+CHART_EVENTS_MAX_RETRIES);
});

it('empty when no event falls on the loaded bars; ok with no badge (and a plain note) when they are outside the visible range',async()=>{
 const before=mount({load:vi.fn(async()=>ok([dividend('2024-02-15')]))});
 const empty=await before.settle();
 expect(empty.props['data-lv-chart-events-state']).toBe('empty');
 expect(empty.props['data-lv-chart-events-total']).toBe(1);expect(empty.props['data-lv-chart-events-markers']).toBe(0);
 expect(empty.props.title).toBe('No splits or dividends on the loaded bars of GME.');
 const away=mount({load:vi.fn(async()=>ok([dividend('2026-02-16')])),timeToX:()=>5000});
 const offscreen=await away.settle();
 expect(offscreen.props['data-lv-chart-events-state']).toBe('ok');
 expect(offscreen.props['data-lv-chart-events-markers']).toBe(1);expect(offscreen.props['data-lv-chart-events']).toBe(0);
 expect(offscreen.props.role).toBeUndefined();
 expect(offscreen.props.title).toBe('The splits and dividends of GME are outside the visible range.');
});

it('no source or both types off: nothing is rendered and nothing is requested',async()=>{
 const load=vi.fn(async()=>ok([]));
 expect(await mount({load,symbol:null}).settle()).toBeNull();
 expect(await mount({load,settings:{dividends:false,splits:false}}).settle()).toBeNull();
 expect(load).not.toHaveBeenCalled();
 expect(chartEventsDiagnostic('GME','KEY_REQUIRED','')).toBe('Splits and dividends for GME did not load (KEY_REQUIRED).');
});
