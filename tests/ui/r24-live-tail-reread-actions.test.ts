import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {buildContextPriceRequestData,type ContextPriceRequest} from '../../src/ui/context-price-request';
import {captureRootChartAction,ChartActionStaleError,type RootChartTarget} from '../../src/ui/chart-action-ownership';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {liveLineageOf} from '../../src/chart/bar-input-identity';
import {chartSourceContextKey,sourceContextForDataset} from '../../src/chart/source-context';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {ChartMenuSnapshot} from '../../src/chart/context-menu';
import type {LocalAlert} from '../../src/domain/alerts';
import type {Bar,BarDataset} from '../../src/domain/types';

// Alpaca's all-exchange tail re-read (refreshTail, every 300 s on a free plan) publishes a new dataset
// object and bars array on the same live lineage (same dataset id and revision). A clicked-price alert dialog opened from
// the chart menu compared the captured bars by array identity, so a re-read in the middle of the edit refused Create
// ("The chart action source or owner changed"). Actual WorkspaceAlerts (catalog, observer, tick) feeding the actual
// AlertDialog under the shared controlled hook model, the actual root chart-action ownership, and the actual Alpaca provider
// on a SYNTHETIC bridge (no network, no key). No browser DOM, GUI or package claim.
const DATE='2026-10-21',ET=(h:number,m=0,s=0)=>newYorkWallTime(DATE,h*60+m)+s;
/** SYNTHETIC tape near 100: all exchanges every minute; IEX on even minutes only, with a close 0.03 lower. */
function minutes(start:number,end:number,feed:string):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil(start/60)*60;t<=end;t+=60){if(feed==='iex'&&(t/60)%2!==0)continue;const c=100+((t/60)%7)/10-(feed==='iex'?0.03:0);out.push({time:t,open:c,high:c+0.2,low:c-0.2,close:c,volume:feed==='sip'?1000:30});}
 return out;
}
const status={schemaVersion:1,state:'ready',symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as unknown as AlpacaStatus;
const intervals:Array<()=>void>=[];
beforeEach(()=>{intervals.length=0;vi.stubGlobal('MutationObserver',class{observe(){}disconnect(){}takeRecords(){return [];}});vi.stubGlobal('setInterval',(callback:()=>void)=>{intervals.push(callback);return intervals.length;});vi.stubGlobal('clearInterval',()=>{});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});

async function setup(){
 let clock=ET(11);vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 let listener:((event:AlpacaEvent)=>void)|null=null;
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:minutes(input.start,input.end,input.feed),nextPageToken:null,provenance:{} as any}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } as unknown as AlpacaBridge&{fetchAlpacaBars:ReturnType<typeof vi.fn>};
 const provider=new AlpacaLiveProvider(bridge,{now:()=>clock*1000,plan:'free'}),handle=provider.open('GME','1m');
 const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};await flush();
 const sipReads=()=>bridge.fetchAlpacaBars.mock.calls.filter(([call]:any)=>call.feed==='sip').length;
 const trade=(t:number,price:number)=>{clock=t;listener?.({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:t,price,high:price,low:price,size:1}],receivedAt:''});};
 const dataset=handle.dataset();
 const props:any={open:true,onClose:vi.fn(),alerts:[] as LocalAlert[],dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,enabled:true,suspended:false,backgroundSave:false,onContextComplete:vi.fn()};
 props.onAlertsChange=vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;});
 props.chart={getSourceContext:()=>sourceContextForDataset(props.dataset,props.bars),getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 /** App's root target: the chart input that is current now (App.tsx requestChartContext). */
 const target=():RootChartTarget=>({epoch:1,cellId:'synthetic-chart',controller:props.chart,input:{bars:props.bars,source:sourceContextForDataset(props.dataset,props.bars),style:'candles'},executionIdentity:'ordinary'});
 /** The chart menu opens on the live chart: the menu snapshot and lease, adopted by the root ownership. */
 const openMenu=()=>{const at=target(),snapshot={token:{},treeOwner:{},instrument:props.dataset.instrument,entity:{kind:'chart'},client:null,local:null,point:{price:100,logical:null,barIndex:null,barTime:null,unit:null,pane:null},cellId:at.cellId,controller:at.controller,input:at.input,executionIdentity:at.executionIdentity} as unknown as ChartMenuSnapshot;
  const lease={snapshot,isCurrent:()=>true,isOwnerCurrent:()=>true,release:vi.fn()};return captureRootChartAction(snapshot,lease,target);};
 /** The provider publishes: App re-renders with the new dataset object (App.tsx passes liveAlertView(dataset), the same object here). */
 const publish=()=>{props.dataset=handle.dataset();props.bars=props.dataset.bars;};
 let child:AlertDialogProps|null=null;
 const view=mountControlledComponent(()=>{const element=WorkspaceAlerts(props) as unknown as {props:AlertDialogProps};child=element.props;return AlertDialog(element.props);});
 const pump=()=>{for(let pass=0;pass<16;pass++){const writes=view.owner.writes;view.render();for(const effect of view.owner.pending.splice(0))effect();if(view.owner.writes===writes)return;}throw Error('Synthetic state kept changing');};
 const settle=async()=>{for(let pass=0;pass<40;pass++){pump();await vi.advanceTimersByTimeAsync(0);for(let i=0;i<10;i++)await Promise.resolve();}pump();};
 /** An interval tick plus the observation it starts (its evaluation yields on setTimeout). */
 const observe=async()=>{tick();for(let k=0;k<5;k++){await vi.advanceTimersByTimeAsync(100);await settle();}};
 const submit=()=>(view.find(node=>node.type==='form').props.onSubmit as (event:{preventDefault():void})=>void)({preventDefault(){}});
 const tick=()=>{const run=intervals.at(-1);if(!run)throw Error('Missing the actual WorkspaceAlerts interval');run();};
 return{props,view,settle,observe,submit,tick,trade,flush,sipReads,publish,openMenu,target,handle,child:()=>child!,done:()=>{handle.close();provider.dispose();}};
}
function openContextDraft(ui:Awaited<ReturnType<typeof setup>>){
 const ownership=ui.openMenu(),source=sourceContextForDataset(ui.props.dataset,ui.props.bars);
 const request:ContextPriceRequest=buildContextPriceRequestData({id:'synthetic-click',action:'price-alert',price:105,instrument:ui.props.dataset.instrument,chartId:'synthetic-chart',sourceKey:chartSourceContextKey(source),style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null});
 // App.tsx assertContextPriceOwner -> the minted request's check -> capturedOwnership.assertCurrent().
 ui.props.assertContextCurrent=vi.fn(()=>ownership.assertCurrent());ui.props.contextRequest=request;
 return ownership;
}

it('a clicked-price alert opened on a live chart still creates after the Alpaca tail re-read publishes a new dataset',async()=>{
 const ui=await setup();
 ui.trade(ET(11,4,10),104);await ui.flush();ui.publish();await ui.settle();
 expect(ui.child().context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();
 const ownership=openContextDraft(ui);await ui.settle();
 const before={dataset:ui.props.dataset as BarDataset,bars:ui.props.bars as Bar[]},reads=ui.sipReads();
 // 15-minute cut moved 6 minutes: refreshTail re-reads the aged IEX tail from all exchanges and replaces those bars.
 ui.trade(ET(11,6,5),104.1);await ui.flush();
 expect(ui.sipReads(),'the tail re-read ran').toBe(reads+1);
 ui.publish();
 expect(ui.props.dataset,'a new dataset object').not.toBe(before.dataset);expect(ui.props.bars,'a new bars array').not.toBe(before.bars);
 expect(ui.props.bars.some((bar:Bar)=>bar.volume===1000&&bar.time>before.bars[0].time),'re-read all-exchange bars are in place').toBe(true);
 expect(liveLineageOf(ui.props.bars)?.key,'same live lineage').toBe(liveLineageOf(before.bars)?.key);
 expect(ui.props.dataset.provenance.revision,'same revision').toBe(before.dataset.provenance.revision);
 expect(()=>ownership.assertCurrent(),'the captured chart action survives a same-lineage live update').not.toThrow();
 await ui.observe();
 expect(ui.child().context,JSON.stringify(ui.child().diagnostics)).toBeTruthy();expect(ui.child().evaluationPending).toBe(false);
 ui.submit();await ui.settle();
 expect(ui.view.text()).not.toMatch(/source or owner changed|Captured settings changed/);
 expect(ui.props.alerts,ui.view.text().replace(/[^{}]*{[^}]*}/g,"").slice(0,1500)).toHaveLength(1);
 expect(ui.props.onContextComplete).toHaveBeenCalledWith(ui.props.contextRequest,'saved');
 ownership.release();ui.done();
});
it('a clicked-price alert still creates after the next live stream bar arrives (60 bars become 61; coordinator probe)',async()=>{
 const ui=await setup();ui.trade(ET(11,3,10),104);await ui.flush();ui.publish();await ui.settle();
 const ownership=openContextDraft(ui);await ui.settle();
 const before=ui.props.bars as Bar[],reads=ui.sipReads();
 ui.trade(ET(11,4,2),104.05);await ui.flush();ui.publish();// a new minute: the forming bar closes and a new one is appended
 expect(ui.sipReads(),'no re-read on this path').toBe(reads);
 expect(ui.props.bars.length).toBe(before.length+1);expect(ui.props.bars).not.toBe(before);
 expect(()=>ownership.assertCurrent()).not.toThrow();
 await ui.observe();ui.submit();await ui.settle();
 expect(ui.view.text()).not.toMatch(/source or owner changed/);
 expect(ui.props.alerts,ui.view.text().replace(/[^{}]*\{[^}]*\}/g,'').slice(-400)).toHaveLength(1);
 expect(ui.props.onContextComplete).toHaveBeenCalledWith(ui.props.contextRequest,'saved');
 ownership.release();ui.done();
});
it('the menu-opened Create alert draft also saves after a tail re-read (binding compared by lineage)',async()=>{
 const ui=await setup();
 ui.trade(ET(11,4,10),104);await ui.flush();ui.publish();await ui.settle();
 (ui.view.find(node=>node.type==='button'&&text(node.props.children)==='Create alert').props.onClick as ()=>void)();await ui.settle();
 const reads=ui.sipReads();ui.trade(ET(11,6,5),104.1);await ui.flush();expect(ui.sipReads()).toBe(reads+1);
 ui.publish();await ui.observe();
 ui.submit();await ui.settle();
 expect(ui.view.text()).not.toMatch(/Captured settings changed|selected chart context changed/);
 expect(ui.props.alerts,ui.view.text().replace(/[^{}]*{[^}]*}/g,"").slice(0,1500)).toHaveLength(1);
 ui.done();
});
it('a genuine source change still refuses: another symbol, and a re-adjusted reload (new revision and lineage)',async()=>{
 const ui=await setup();ui.trade(ET(11,4,10),104);await ui.flush();ui.publish();await ui.settle();
 const ownership=openContextDraft(ui);await ui.settle();
 // Another non-live input in place of the live one (a symbol change): the bars and source no longer match.
 const other=structuredClone(ui.props.dataset) as BarDataset;other.instrument={...other.instrument,id:'synthetic-other',symbol:'SPY'};other.provenance={...other.provenance,datasetId:'live:alpaca:SPY:1m',revision:'live-v1:other:9'};
 const live={dataset:ui.props.dataset,bars:ui.props.bars};ui.props.dataset=other;ui.props.bars=other.bars;
 let failure:unknown;try{ownership.assertCurrent();}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(ChartActionStaleError);expect((failure as Error).message).toBe('The chart changed. Reopen the menu.');
 expect((failure as ChartActionStaleError).term).toBe('bars');
 // Same symbol, but a new revision and lineage (renewLiveRevision after a price re-adjustment): still refused.
 ui.props.dataset=live.dataset;ui.props.bars=live.bars;expect(()=>ownership.assertCurrent()).not.toThrow();
 const renewed=[...live.bars];ui.props.bars=renewed;ui.props.dataset={...live.dataset,bars:renewed,provenance:{...live.dataset.provenance,revision:'live-v1:renewed:2'}};
 expect(()=>ownership.assertCurrent()).toThrow(ChartActionStaleError);
 ui.submit();await ui.settle();expect(ui.props.alerts).toHaveLength(0);
 ownership.release();ui.done();
});
