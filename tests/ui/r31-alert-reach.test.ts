import {beforeEach,expect,it,vi} from 'vitest';
import {savedDrawingsForInstrument} from '../../src/ui/saved-drawing-lookup';
import {alertUsesVwapEventAnchor,datasetProviderSymbol,VwapEventDateReach,vwapEventTargets,VWAP_EVENT_REQUEST_GAP_MS,VWAP_EVENT_RETRY_MS} from '../../src/ui/vwap-event-reach';
import {createChartEventsLoader,type ChartEventsResult} from '../../src/domain/chart-events';
import {clearVwapEventDates,vwapEventDatesFor} from '../../src/domain/vwap-event-anchors';
import {alertDrawingIds,alertsOfRemovedDrawings,drawingRemovals,type DrawingLayoutSnapshot} from '../../src/domain/drawing-alert-links';
import {DrawingAlertCleanup,DRAWING_ALERT_PROMPT_TITLE} from '../../src/ui/DrawingAlertCleanup';
import type {LocalAlert} from '../../src/domain/alerts';
import type {AlertScalarSource} from '../../src/domain/alert-observation';

// Everything is SYNTHETIC: hand-built saved workspaces and alerts, a fake corporate-actions loader, a manual
// clock and timer queue, and controlled React hooks (no DOM, no network, no key).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const cell=(initial:()=>any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=initial();return i;};return{...actual,
 useState:(initial:any)=>{const i=cell(()=>typeof initial==='function'?initial():initial);return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>hooks.cells[cell(()=>({current:initial}))],
 useEffect:(run:()=>void)=>{run();}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;clearVwapEventDates();});

const basis=(instrumentId:string)=>({instrumentId}) as never;
const cell=(instrumentId:string,ids:string[],extra:Record<string,unknown>={})=>({datasetId:`live:alpaca-iex:${instrumentId.slice(3)}:1m`,drawings:{version:1,drawings:ids.map(id=>({id}))},drawingScopes:{schemaVersion:1,activeBasis:basis(instrumentId),inactive:[]},indicators:[],...extra});
const vwap=(anchor:string)=>({kind:'vwap',id:'v1',paneId:null,inputs:{anchor,timezone:'UTC',source:'hlc3'}});

function alert(id:string,options:{instrumentId?:string;datasetId?:string;source?:unknown;status?:LocalAlert['status'];condition?:Record<string,unknown>}={}):LocalAlert{
 const datasetKey=JSON.stringify(Array.from({length:10},(_,i)=>i===9?options.datasetId??'live:alpaca-iex:GME:1m':'x'));
 return {definition:{id,instrumentId:options.instrumentId??'US:GME',sourceId:'s',name:'Alert '+id,message:'',condition:{kind:'crossing-up',value:1,...options.condition},frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'r',observationBinding:options.source?{schemaVersion:2,datasetKey,sessionId:'s',replayRunId:null,fixture:false,completionPolicy:'unknown',source:options.source}:undefined},
  revision:1,armedAt:1,status:options.status??'active',lastSequence:null,lastTime:null,lastValue:null,closedBars:[],currentBarId:null,previousClosedValue:null,lastTriggeredBar:null,lastTriggeredAt:null,missedDataGaps:0,history:[]} as unknown as LocalAlert;
}
const vwapSource=(anchor:string):AlertScalarSource=>({kind:'indicator',instanceId:'v',snapshotId:'s',indicator:'vwap',plotId:'vwap',inputs:{anchor,timezone:'UTC',source:'hlc3'},inputBasis:'standard-ohlc',transformId:'standard'});
const boundary=(drawingId:string)=>({kind:'drawing-boundary',instanceId:drawingId,snapshotId:'b',geometry:{drawingId},mutationPolicy:'frozen'});
const legacy=(drawingId:string)=>({kind:'drawing',instanceId:drawingId,snapshotId:'d',tool:'trend_line',anchors:[],settings:{},evaluation:'signed-price-distance',coordinateModel:'linear-time-price'});

it('saved-drawing lookup scans every saved layout tab, and reads the open layout from the working grid, not its saved copy',()=>{
 const workspace={grid:{cells:{a:cell('US:GME',['working'])}},
  layoutLibrary:{activeId:'L1',entries:[
   {id:'L1',grid:{cells:{a:cell('US:GME',['stale-copy-of-open-layout'])}}},
   {id:'L2',grid:{cells:{x:cell('US:GME',['tab2']),y:cell('US:SPY',['spy-tab2'],{drawingScopes:{schemaVersion:1,activeBasis:basis('US:SPY'),inactive:[{basis:basis('US:GME'),document:{drawings:[{id:'tab2-inactive'}]}}]}})}}},
   {id:'L3',grid:{cells:{z:cell('US:GME',['working','tab3'])}}}]}};
 expect(savedDrawingsForInstrument(workspace as never,'US:GME').map(row=>(row as {id:string}).id)).toEqual(['working','tab2','tab2-inactive','tab3']);
 expect(savedDrawingsForInstrument(workspace as never,'US:SPY').map(row=>(row as {id:string}).id)).toEqual(['spy-tab2']);
 // Malformed library rows are skipped, never thrown on.
 expect(savedDrawingsForInstrument({grid:{cells:{}},layoutLibrary:{activeId:'q',entries:[null,{id:'w'},{id:'e',grid:{cells:null}}]}} as never,'US:GME')).toEqual([]);
});

it('VWAP event targets: background alerts with a Dividends or Splits anchor, and VWAP cells of every layout tab, Alpaca stocks only',()=>{
 expect(datasetProviderSymbol('live:alpaca-iex:BRK.B:5m')).toEqual({providerId:'alpaca-iex',symbol:'BRK.B'});
 expect(datasetProviderSymbol('alpaca-sip-delayed:AAPL:1D')).toEqual({providerId:'alpaca-sip-delayed',symbol:'AAPL'});
 expect(datasetProviderSymbol('wl:AAPL')).toBeNull();
 const alerts=[
  alert('div',{instrumentId:'US:GME',datasetId:'live:alpaca-iex:GME:1m',source:vwapSource('Dividends')}),
  alert('cmp',{instrumentId:'US:AMC',datasetId:'alpaca-sip-delayed:AMC:1D',source:{kind:'comparison',snapshotId:'c',left:{kind:'price',field:'close'},right:vwapSource('Splits')}}),
  alert('session',{instrumentId:'US:TSLA',datasetId:'live:alpaca-iex:TSLA:1m',source:vwapSource('Session')}),
  alert('paused',{instrumentId:'US:NVDA',datasetId:'live:alpaca-iex:NVDA:1m',source:vwapSource('Dividends'),status:'paused'}),
  alert('crypto',{instrumentId:'CB:BTC-USD',datasetId:'live:coinbase:BTC-USD:1m',source:vwapSource('Dividends')}),
 ];
 expect(alerts.map(alertUsesVwapEventAnchor)).toEqual([true,true,false,true,true]);
 const workspace={grid:{cells:{a:cell('US:SPY',[],{indicators:[vwap('Splits')]}),b:cell('US:QQQ',[],{indicators:[vwap('Session')]})}},
  layoutLibrary:{activeId:'L1',entries:[{id:'L2',grid:{cells:{c:cell('US:IWM',[],{indicators:[vwap('Dividends')]}),d:cell('US:GME',[],{indicators:[vwap('Dividends')]})}}}]}};
 expect(vwapEventTargets({alerts,workspace:workspace as never})).toEqual([
  {instrumentId:'US:GME',symbol:'GME'},{instrumentId:'US:AMC',symbol:'AMC'},{instrumentId:'US:SPY',symbol:'SPY'},{instrumentId:'US:IWM',symbol:'IWM'}]);
});

function harness(results:(symbol:string)=>ChartEventsResult|Promise<ChartEventsResult>,start=Date.UTC(2026,9,22,15,0)){
 let clock=start;const timers:{at:number;run:()=>void}[]=[],asked:{symbol:string;at:number}[]=[],loaded:string[]=[];let inFlight=0,maxInFlight=0;
 const reach=new VwapEventDateReach({
  load:async symbol=>{asked.push({symbol,at:clock});inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);try{return await results(symbol);}finally{inFlight--;}},
  onLoaded:id=>loaded.push(id),now:()=>clock,
  setTimer:(run,ms)=>{const timer={at:clock+ms,run};timers.push(timer);return timer;},clearTimer:handle=>{const i=timers.indexOf(handle as never);if(i>=0)timers.splice(i,1);}});
 const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 /** Advances the manual clock, running due timers in order. */
 const advance=async(ms:number)=>{const end=clock+ms;await flush();for(;;){timers.sort((a,b)=>a.at-b.at);const next=timers[0];if(!next||next.at>end)break;timers.shift();clock=Math.max(clock,next.at);next.run();await flush();}clock=end;};
 return {reach,asked,loaded,advance,get maxInFlight(){return maxInFlight;},setClock:(value:number)=>{clock=value;}};
}
const ok=(symbol:string,exDate='2026-03-02',stale=false):ChartEventsResult=>({ok:true,value:{schemaVersion:1,symbol,events:[{id:symbol+exDate,kind:'cash-dividend',symbol,exDate,recordDate:null,payableDate:null,processDate:null,amount:0.1,currency:'USD'}],retrievedAt:'',cached:false,stale,synthetic:true,provenance:{provider:'SYNTHETIC',kind:'owner-key',source:'corporate-actions',license:'SYNTHETIC'}}});

it('the reach loads each instrument once, one request at a time and rate-limited, and remembers the dates per instrument',async()=>{
 const h=harness(symbol=>ok(symbol));
 h.reach.sync([{instrumentId:'US:GME',symbol:'GME'},{instrumentId:'US:SPY',symbol:'SPY'},{instrumentId:'US:AMC',symbol:'AMC'}]);
 await h.advance(10*VWAP_EVENT_REQUEST_GAP_MS);
 expect(h.asked.map(row=>row.symbol)).toEqual(['GME','SPY','AMC']);
 expect(h.maxInFlight).toBe(1);
 for(let i=1;i<h.asked.length;i++)expect(h.asked[i].at-h.asked[i-1].at).toBeGreaterThanOrEqual(VWAP_EVENT_REQUEST_GAP_MS);
 expect(h.loaded).toEqual(['US:GME','US:SPY','US:AMC']);
 expect(vwapEventDatesFor('US:SPY')).toEqual([{exDate:'2026-03-02',kind:'cash-dividend'}]);
 // Cached per instrument: a new sync with the same targets (and an hour later) asks nothing.
 h.reach.sync([{instrumentId:'US:GME',symbol:'GME'},{instrumentId:'US:SPY',symbol:'SPY'},{instrumentId:'US:AMC',symbol:'AMC'}]);
 await h.advance(3600*1000);
 expect(h.asked).toHaveLength(3);
 expect(h.reach.loadedToday().sort()).toEqual(['US:AMC','US:GME','US:SPY']);
 h.reach.dispose();
});

it('the reach refreshes on each new New York day, retries a failure later, and a failure keeps the dates it had',async()=>{
 let fail=false;
 // 23:55 in New York.
 const h=harness(symbol=>fail?{ok:false,error:{code:'ALPACA_RATE_LIMITED',message:'busy'}}:ok(symbol,'2026-03-02'),Date.UTC(2026,9,23,3,55));
 h.reach.sync([{instrumentId:'US:GME',symbol:'GME'}]);
 await h.advance(1000);
 expect(h.asked).toHaveLength(1);
 // Next New York day: asked again (the periodic check notices the new day). This time the request fails.
 fail=true;
 await h.advance(10*60*1000);
 expect(h.asked).toHaveLength(2);
 expect(vwapEventDatesFor('US:GME')).toEqual([{exDate:'2026-03-02',kind:'cash-dividend'}]);
 // A failure is asked again only after the retry period.
 await h.advance(VWAP_EVENT_RETRY_MS-60*1000);
 expect(h.asked).toHaveLength(2);
 fail=false;
 await h.advance(2*60*1000);
 expect(h.asked).toHaveLength(3);
 expect(h.loaded).toEqual(['US:GME','US:GME']);
 // An instrument no longer wanted is not asked again.
 h.reach.sync([]);
 await h.advance(3*24*3600*1000);
 expect(h.asked).toHaveLength(3);
 h.reach.dispose();
});

it('the renderer loader memo never outlives the New York day, so the daily refresh reaches main',async()=>{
 let now=Date.UTC(2026,9,22,3,0);// 23:00 in New York on the 21st
 const calls:string[]=[];
 const load=createChartEventsLoader(()=>({fetchAlpacaCorporateActions:async input=>{calls.push(input.symbol);return ok(input.symbol);}}),()=>now);
 await load('GME');await load('GME');
 expect(calls).toEqual(['GME']);
 now+=2*3600*1000;// 01:00 on the 22nd, inside the six hours
 await load('GME');
 expect(calls).toEqual(['GME','GME']);
});

it('drawing-alert links: the alerts made from a drawing, and which drawings a saved layout change deleted',()=>{
 expect(alertDrawingIds(alert('b',{source:boundary('d1')}))).toEqual(['d1']);
 expect(alertDrawingIds(alert('l',{source:legacy('d2')}))).toEqual(['d2']);
 expect(alertDrawingIds(alert('c',{source:{kind:'comparison',snapshotId:'c',left:boundary('d3'),right:{kind:'price',field:'close'}}}))).toEqual(['d3']);
 expect(alertDrawingIds(alert('p',{condition:{kind:'position',position:{drawingId:'d4'}}}))).toEqual(['d4']);
 expect(alertDrawingIds(alert('f',{condition:{kind:'level-crossing',levels:{drawingId:'d5'}}}))).toEqual(['d5']);
 expect(alertDrawingIds(alert('price',{source:{kind:'price',field:'close'}}))).toEqual([]);
 const snap=(layoutId:string,cells:Record<string,unknown>):DrawingLayoutSnapshot=>({layoutId,grid:{cells:cells as never}});
 const before=snap('L1',{a:cell('US:GME',['d1','d2','keep']),b:cell('US:SPY',['s1'])});
 // A real deletion in cell a.
 expect(drawingRemovals(before,snap('L1',{a:cell('US:GME',['keep']),b:cell('US:SPY',['s1'])}))).toEqual([{instrumentId:'US:GME',ids:['d1','d2']}]);
 // Not deletions: a layout switch, a symbol change of the cell, a removed cell, an id that moved to another cell.
 expect(drawingRemovals(before,snap('L2',{a:cell('US:GME',[])}))).toEqual([]);
 expect(drawingRemovals(before,snap('L1',{a:cell('US:AMC',[]),b:cell('US:SPY',['s1'])}))).toEqual([]);
 expect(drawingRemovals(before,snap('L1',{b:cell('US:SPY',['s1'])}))).toEqual([]);
 expect(drawingRemovals(before,snap('L1',{a:cell('US:GME',['keep']),b:cell('US:SPY',['s1','d1','d2'])}))).toEqual([]);
 expect(drawingRemovals(null,snap('L1',{}))).toEqual([]);
 const alerts=[alert('on-d1',{source:boundary('d1')}),alert('other',{source:boundary('zz')}),alert('spy-d2',{instrumentId:'US:SPY',source:boundary('d2')}),alert('pos',{condition:{kind:'position',position:{drawingId:'d2'}}})];
 expect(alertsOfRemovedDrawings(alerts,[{instrumentId:'US:GME',ids:['d1','d2']}]).map(row=>row.definition.id)).toEqual(['on-d1','pos']);
});

it('deleting a drawing with alerts asks: Keep leaves them, Delete removes them; a layout switch never asks',()=>{
 const alerts=[alert('a1',{source:boundary('d1')}),alert('a2',{condition:{kind:'position',position:{drawingId:'d1'}}}),alert('a3',{source:{kind:'price',field:'close'}})];
 let saved=[...alerts];const published:{next:LocalAlert[];expected?:LocalAlert[]}[]=[],messages:string[]=[];
 const grid1={cells:{a:cell('US:GME',['d1','d9'])}},grid2={cells:{a:cell('US:GME',['d9'])}};
 const render=(grid:unknown,layoutId='L1',held=false)=>{hooks.cursor=0;return DrawingAlertCleanup({layoutId,grid:grid as never,alerts:saved,readAlerts:()=>saved,enabled:true,held,onAlertsChange:(next,expected)=>{published.push({next,expected});saved=next;return true;},onMessage:message=>messages.push(message)});};
 expect(render(grid1)).toBeNull();
 expect(render(grid1)).toBeNull();
 // Delete d1 while another dialog is open: the question waits.
 expect(render(grid2,'L1',true)).toBeNull();
 let tree=render(grid2);
 expect(tree?.props.title).toBe(DRAWING_ALERT_PROMPT_TITLE);
 expect(text(tree)).toContain('The deleted drawing had 2 alerts: "Alert a1", "Alert a2".');
 // Keep: nothing is published and the question closes.
 find(tree,node=>node.type==='button'&&text(node)==='Keep alerts').props.onClick();
 expect(render(grid2)).toBeNull();
 expect(published).toEqual([]);
 // Undo restores d1, and a second delete asks again; Delete publishes the list without both alerts.
 // (The controlled hooks show a state update on the next render, as React re-renders after setState.)
 render(grid1);render(grid2);tree=render(grid2);
 find(tree,node=>node.type==='button'&&text(node)==='Delete alerts').props.onClick();
 expect(published).toHaveLength(1);
 expect(published[0].next.map(row=>row.definition.id)).toEqual(['a3']);
 expect(published[0].expected!.map(row=>row.definition.id)).toEqual(['a1','a2','a3']);
 expect(messages).toEqual(['Deleted 2 alerts.']);
 expect(render(grid2)).toBeNull();
 // A layout switch to a layout without the drawing never asks.
 saved=[alert('b1',{source:boundary('d9')})];
 render(grid2,'L1');
 expect(render({cells:{a:cell('US:GME',[])}},'L2')).toBeNull();
});
