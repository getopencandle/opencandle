import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createLocalAlert,type LocalAlert} from '../../src/domain/alerts';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Actual wrapper, catalog and observer. Controlled hooks/effects and native
// controller metadata only; no mounted renderer, timers or GUI interaction.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>,cleanups:[] as Array<(()=>void)|undefined>,writes:0,timers:[] as Array<()=>void>}));
vi.mock('react',async()=>{const effect=(run:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.effects.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()??undefined;});}};const memo=(run:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))hooks.cells[i]={deps,value:run()};return hooks.cells[i].value;};return{...await vi.importActual<any>('react'),useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:effect,useLayoutEffect:effect,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useMemo:memo};});
const microtasks=async()=>{await new Promise<void>(resolve=>setTimeout(resolve,0));for(let i=0;i<10;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(yes=>resolve=yes);return{resolve,promise};};
function setup(){
 let clock=1791979200;vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1704153600,open:9,high:10,low:8,close:9,volume:100}];
 const props:any={open:false,onClose:vi.fn(),alerts:[],onAlertsChange:vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;}),dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,enabled:true,suspended:false};
 props.chart={getSourceContext:vi.fn(()=>sourceContextForDataset(dataset,props.bars)),getStyle:()=> 'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 const render=()=>{hooks.cursor=0;return WorkspaceAlerts(props).props;},effects=()=>{render();hooks.effects.splice(0).forEach(run=>run());},settle=async()=>{for(let i=0;i<8;i++){effects();await microtasks();}return render();};
 const seed=async()=>{const child=await settle(),context=child.context;expect(context,JSON.stringify(child.diagnostics)).not.toBeNull();const alert=createLocalAlert({id:'synthetic-cross',name:'Synthetic crossing',message:'Synthetic only',instrumentId:context.instrumentId,sourceId:context.sourceId,runId:context.runId,mode:context.mode,observationBinding:context.binding,conditionVersion:2,condition:{kind:'crossing-up',value:10},frequency:'every-time',createdAt:clock,expiresAt:null});expect(child.onAlertsChange([alert],props.alerts)).toBe(true);child.onRequestObservation('after-save');await settle();return render();};
 const append=()=>{props.bars=[...props.bars,{time:1704240000,open:11,high:12,low:10,close:11,volume:100}];};
 return{props,render,effects,settle,seed,append,advance:(seconds:number)=>{clock+=seconds;},clock:()=>clock};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];hooks.writes=0;hooks.timers=[];vi.stubGlobal('setInterval',(fn:()=>void)=>{hooks.timers.push(fn);return hooks.timers.length;});vi.stubGlobal('clearInterval',()=>{});});
afterEach(()=>{hooks.cleanups.forEach(run=>run?.());vi.restoreAllMocks();vi.unstubAllGlobals();});

it('suspension preserves the actual source session, blocks publication/capture and expires before resumed crossing',async()=>{
 const ui=setup(),before=await ui.seed(),binding=before.context.binding,reset=vi.spyOn(TechnicalAlertObserver.prototype,'reset'),capture=ui.props.chart.getSourceContext;
 const expiring=createLocalAlert({...ui.props.alerts[0].definition,id:'synthetic-expiring',condition:{kind:'greater',value:1000},expiresAt:ui.clock()+2});
 expect(before.onAlertsChange([...ui.props.alerts,expiring],ui.props.alerts)).toBe(true);before.onRequestObservation('after-save');await ui.settle();
 ui.props.suspended=true;await ui.settle();const publications=ui.props.onAlertsChange.mock.calls.length,captures=capture.mock.calls.length,resets=reset.mock.calls.length;
 ui.advance(3);hooks.timers[0]();await ui.settle();
 expect(ui.props.onAlertsChange).toHaveBeenCalledTimes(publications);expect(capture).toHaveBeenCalledTimes(captures);expect(reset).toHaveBeenCalledTimes(resets);
 expect(ui.render().context).toBeNull();expect(before.onAlertsChange(ui.props.alerts,ui.props.alerts)).toBe(false);expect(()=>before.validateCurrentSource(binding)).toThrow(/paused|suspend/);
 expect(ui.props.alerts.find((row:LocalAlert)=>row.definition.id==='synthetic-expiring').status).toBe('active');
 ui.append();ui.props.suspended=false;const resumed=await ui.settle();
 expect(resumed.context.binding.sessionId).toBe(binding.sessionId);expect(reset).toHaveBeenCalledTimes(resets);
 const added=ui.props.onAlertsChange.mock.calls.slice(publications);expect(added[0][0].find((row:LocalAlert)=>row.definition.id==='synthetic-expiring').status).toBe('expired');
 expect(ui.props.alerts.find((row:LocalAlert)=>row.definition.id==='synthetic-cross').history.map((row:any)=>row.value)).toEqual([11]);
});

it('resume rejects retained save/capture callbacks until a fresh generation is usable',async()=>{
 const ui=setup(),old=await ui.seed();ui.props.suspended=true;await ui.settle();
 ui.props.suspended=false;ui.effects();expect(ui.render().context).toBeNull();const publications=ui.props.onAlertsChange.mock.calls.length;
 expect(old.onAlertsChange(ui.props.alerts,ui.props.alerts)).toBe(false);expect(()=>old.validateCurrentSource(old.context.binding)).toThrow(/fresh|pending|changing|paused|capture/);
 expect(ui.props.onAlertsChange).toHaveBeenCalledTimes(publications);await ui.settle();expect(ui.render().context).not.toBeNull();
});

it('a calculated response canceled before publication does not consume the later crossing',async()=>{
 const ui=setup();await ui.seed();const gate=deferred(),computed=deferred(),original=TechnicalAlertObserver.prototype.observeForPublication;let hold=true;
 vi.spyOn(TechnicalAlertObserver.prototype,'observeForPublication').mockImplementation(async function(this:TechnicalAlertObserver,...args){const result=await original.apply(this,args);if(hold){computed.resolve();await gate.promise;}return result;});
 ui.append();ui.effects();await computed.promise;ui.props.suspended=true;ui.effects();hold=false;gate.resolve();await ui.settle();
 expect(ui.props.alerts[0].history).toEqual([]);ui.props.suspended=false;await ui.settle();
 expect(ui.props.alerts[0].history.map((row:any)=>row.value)).toEqual([11]);
});

it('a frozen SMA alert continues across suspension and native indicator removal with its original session',async()=>{
 const ui=setup();ui.props.bars=[{time:1704153600,open:2,high:3,low:1,close:2,volume:100},{time:1704240000,open:4,high:5,low:3,close:4,volume:100}];
 let native:any[]=[{id:'synthetic-sma',kind:'sma',inputs:{length:2,source:'close'},plots:{},offset:0,visible:true,paneId:null}];ui.props.chart.indicators.serialize=()=>native;
 (await ui.settle()).onSourceChange('indicator:synthetic-sma:sma');const selected=await ui.settle(),context=selected.context;expect(context.binding.source).toMatchObject({kind:'indicator',indicator:'sma',inputs:{length:2,source:'close'}});
 const alert=createLocalAlert({id:'synthetic-frozen-sma',name:'Synthetic frozen SMA',message:'Synthetic only',instrumentId:context.instrumentId,sourceId:context.sourceId,runId:context.runId,mode:context.mode,observationBinding:context.binding,conditionVersion:2,condition:{kind:'crossing-up',value:4},frequency:'every-time',createdAt:ui.clock(),expiresAt:null});
 expect(selected.onAlertsChange([alert],ui.props.alerts)).toBe(true);selected.onRequestObservation('after-save');await ui.settle();
 ui.props.suspended=true;await ui.settle();native=[];ui.props.bars=[...ui.props.bars,{time:1704326400,open:8,high:9,low:7,close:8,volume:100}];ui.props.suspended=false;const resumed=await ui.settle();
 expect(resumed.context).toBeNull();expect(resumed.contexts.some((value:any)=>value.binding.sessionId===context.binding.sessionId)).toBe(true);
 expect(ui.props.alerts[0].history.map((row:any)=>row.value)).toEqual([6]);expect(ui.props.alerts[0].history[0].observation.binding.sessionId).toBe(context.binding.sessionId);
});
