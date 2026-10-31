import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {focusDocument,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import type {LocalAlert} from '../../src/domain/alerts';
import type {Bar,BarDataset} from '../../src/domain/types';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {barInputIdentity,isLiveInputIdentity,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {sameChartSourceBasis,sourceContextForDataset} from '../../src/chart/source-context';
import {cellSessionDataset} from '../../src/chart/cell-session';

// Final fixes. Actual WorkspaceAlerts feeding the actual AlertDialog under the shared
// controlled harness (as bugfix-g-alert-source-draft). No browser DOM or GUI claim.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.stubGlobal('setInterval',()=>1);vi.stubGlobal('clearInterval',()=>{});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

function setup(dataset:BarDataset,extra:Record<string,unknown>={},options:{noEvent?:boolean}={}){
 const clock=dataset.bars.at(-1)!.time+3600;vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const props:any={open:true,onClose:vi.fn(),alerts:[] as LocalAlert[],dataset,bars:dataset.bars,chartId:'fix-final-chart',replay:null,enabled:true,suspended:false,backgroundSave:false,assertContextCurrent:vi.fn(),onContextComplete:vi.fn(),...extra};
 props.onAlertsChange=vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;});
 props.chart={getSourceContext:()=>sourceContextForDataset(dataset,props.bars),getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 let child:AlertDialogProps|null=null;
 const view=mountControlledComponent(()=>{const element=WorkspaceAlerts(props) as unknown as {props:AlertDialogProps};child=options.noEvent?{...element.props,event:null}:element.props;return AlertDialog(child);});
 const pump=()=>{for(let pass=0;pass<16;pass++){const writes=view.owner.writes;view.render();for(const effect of view.owner.pending.splice(0))effect();if(view.owner.writes===writes)return;}throw Error('Synthetic state kept changing');};
 const settle=async()=>{for(let pass=0;pass<8;pass++){pump();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();await vi.advanceTimersByTimeAsync(0);for(let i=0;i<10;i++)await Promise.resolve();}pump();};
 const button=(name:string)=>view.find(node=>node.type==='button'&&(text(node.props.children)===name||node.props['aria-label']===name));
 const level=()=>view.find(node=>node.type==='input'&&node.props['aria-label']==='Alert level');
 return{props,view,settle,button,level,child:()=>child!};
}
/** An Alpaca US equity daily chart (as the keyless stub opens) with fixture prices. */
function alpacaDaily():BarDataset{const shell=alpacaSearchDatasets(true,['GME'],'1D')[0]!,bars=fixtureDataset('GME',200).bars;return{...shell,bars};}

it('N4: a price alert whose source has no observed value yet (1D, Regular hours) opens with the last price and creates',async()=>{
 const daily=alpacaDaily(),dataset=cellSessionDataset(daily,{session:'regular'});
 // The owner's shape: the chart's price source has a context but no observed value yet, so the level used to open empty and
 // Create said "Alert level must be a finite number."
 const ui=setup(dataset,{sessionOverride:'regular'},{noEvent:true});await ui.settle();
 expect(ui.child().context,'the price source context is ready').toBeTruthy();expect(ui.child().event).toBeNull();
 (ui.button('Create alert').props.onClick as ()=>void)();await ui.settle();
 const last=dataset.bars.at(-1)!.close;
 expect(ui.level().props.value,'level seeded from the last close').not.toBe('');
 expect(Number(ui.level().props.value)).toBeCloseTo(last,2);
 (ui.view.find(node=>node.type==='form'&&node.props.id==='local-alert-form').props.onSubmit as (event:unknown)=>void)({preventDefault:()=>{}});await ui.settle();
 expect(ui.view.text()).not.toContain('must be a finite number');
 expect(ui.props.alerts.length,ui.view.text()).toBe(1);
 expect(ui.props.alerts[0].definition.condition.value).toBeCloseTo(last,2);
});
it('N4: with an observed value the level is that value, as before',async()=>{
 const daily=alpacaDaily(),dataset=cellSessionDataset(daily,{session:'regular'});
 const ui=setup(dataset,{sessionOverride:'regular'});await ui.settle();
 (ui.button('Create alert').props.onClick as ()=>void)();await ui.settle();
 expect(Number(ui.level().props.value)).toBeCloseTo(ui.child().event!.value!,2);
});

// Item 5: the drawing manager owner check is the actual adapter body (sliced from src/chart/adapter.ts, as
// tests/chart/live-incremental-adapter.test.ts does), run against controlled chart state.
function managerOwner(){
 const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n'),first=text.indexOf('  const captureDrawingManagerOwner='),last=text.indexOf('  const duplicateOwn=',first);
 if(first<0||last<0)throw Error('Review adapter boundary: captureDrawingManagerOwner');
 const code=`const {isLiveInputIdentity,sameChartSourceBasis,state}=injected;let disposed=false,analysisUnavailable='',analysisPending=0;const marketQueue={isPending:()=>state.pending};
 let currentSource=state.source,currentBars=state.bars,requestedStyle='candles';
 ${text.slice(first,last)}
 return{capture:captureDrawingManagerOwner,set:(source,bars)=>{currentSource=source;currentBars=bars;}};`;
 const state={source:null as any,bars:null as any,pending:false};
 return{state,make:()=>new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({isLiveInputIdentity,sameChartSourceBasis,state}) as {capture:()=>()=>void;set:(source:unknown,bars:readonly Bar[])=>void}};
}
it('item 5: live ticks keep an open Drawing manager current; a different chart still retires it',()=>{
 const base=fixtureDataset('GME',120),lineage='live:alpaca-iex:GME:1D|fix-final';let seq=0;
 const snapshot=(bars:Bar[])=>{stampLiveLineage(bars,lineage,++seq);return{bars,source:sourceContextForDataset(base,bars)};};
 const first=snapshot(base.bars.map(bar=>({...bar})));
 expect(isLiveInputIdentity(barInputIdentity(first.bars))).toBe(true);
 const owner=managerOwner();owner.state.source=first.source;owner.state.bars=first.bars;const chart=owner.make();
 const guard=chart.capture();
 // Twenty ticks: the forming bar changes and a new bar opens. The bars array is new every time.
 let bars=first.bars;
 for(let tick=0;tick<20;tick++){const last=bars.at(-1)!;bars=tick===10?[...bars,{...last,time:last.time+86400}]:[...bars.slice(0,-1),{...last,close:last.close+0.01}];const next=snapshot(bars);chart.set(next.source,next.bars);expect(guard).not.toThrow();}
 // Another symbol (not the same live input) retires the manager, with no "Error: " prefix on the message.
 const other=fixtureDataset('SPY',120),otherBars=other.bars.map(bar=>({...bar}));chart.set(sourceContextForDataset(other,otherBars),otherBars);
 expect(guard).toThrow('Drawing manager chart input changed. Close and reopen this manager.');
 // A static (non-live) chart keeps the exact-input rule.
 const plain=managerOwner(),still=base.bars.map(bar=>({...bar}));plain.state.source=sourceContextForDataset(base,still);plain.state.bars=still;const fixed=plain.make(),check=fixed.capture();
 expect(check).not.toThrow();const swapped=still.map(bar=>({...bar}));fixed.set(sourceContextForDataset(base,swapped),swapped);expect(check).toThrow(/chart input changed/);
});

import {layoutTabPrice,layoutTabQuote} from '../../src/ui/layout-tab-quote';
import {seriesSectionTitle} from '../../src/ui/data-window-model';
import {symbolInfoRows} from '../../src/domain/symbol-info';
import {listIntervalSources} from '../../src/domain/intervals';
import {setDemoDataMode} from '../../src/domain/demo-mode';
import {demoPlaceholderDataset} from '../../src/domain/fixtures';
import {stripErrorPrefix} from '../../src/ui/user-error';
it('item 1: the tab quote carries the last price at tick precision, from the same quote as the change',()=>{
 const gme=fixtureDataset('GME',500),quote=layoutTabQuote(gme,[gme])!;
 expect(quote.last).toBe(gme.bars.at(-1)!.close);expect(quote.priceText).toBe(layoutTabPrice(gme.bars.at(-1)!.close,gme.instrument.tickSize));
 expect(layoutTabPrice(23.5,0.01)).toBe('23.50');expect(layoutTabPrice(67850,0.01)).toBe('67,850.00');expect(layoutTabPrice(null,0.01)).toBeNull();
});
it('item 4: outside the legacy demo no surface names the demo source; example mode says Example data',()=>{
 try{
  setDemoDataMode('off');const empty=demoPlaceholderDataset('GME','1D');
  expect(seriesSectionTitle({symbol:'GME',exchange:'SYNTHETIC',interval:'240m',description:'',tickSize:0.01})).toBe('GME · 4h');
  const info=symbolInfoRows(empty,null).map(row=>row.value).join(' | ');expect(info).not.toMatch(/SYNTHETIC|[Ss]ynthetic|demo|supplied/);expect(info).toContain('No data yet');
  const label=listIntervalSources([empty],empty.instrument.id,'1D').map(row=>row.label).join(' ');expect(label).toBe('No data | 1D');
  setDemoDataMode('example');expect(symbolInfoRows(fixtureDataset('GME',20),null).find(row=>row.id==='feed')!.value).toBe('Example data (not market prices)');
 }finally{setDemoDataMode('legacy');}
 expect(stripErrorPrefix('Chart unavailable: Error: x failed')).toBe('Chart unavailable: x failed');expect(stripErrorPrefix('TypeError: bad')).toBe('bad');
});
