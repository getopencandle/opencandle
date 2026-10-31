import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {focusDocument,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog,qualifiedSourceNote,type AlertDialogProps} from '../../src/ui/AlertDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {LocalAlert} from '../../src/domain/alerts';
import type {AlertSourceSnapshot,AlertConditionSource} from '../../src/domain/alert-observation';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {BackgroundAlertWatcher} from '../../src/ui/background-alert-watcher';
import {planBackgroundAlertFeeds} from '../../src/ui/background-alert-plan';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {LiveHandle} from '../../src/domain/live-provider';
import {alertOn,liveLike} from '../helpers/background-alert-fixtures';

// The "+ Add condition" builder in the actual WorkspaceAlerts + AlertDialog (shared controlled harness, no browser
// DOM claim), and all-conditions alerts in the background watcher. SYNTHETIC bars and alerts only; no network, no key.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
const disposers:Array<()=>void>=[];
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();for(const dispose of disposers.splice(0))dispose();});

function setup(){
 vi.stubGlobal('setInterval',()=>1);vi.stubGlobal('clearInterval',()=>{});vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const clock=1791979200;vi.spyOn(Date,'now').mockImplementation(()=>clock*1000);
 const dataset=fixtureDataset('GME',1);dataset.bars=[{time:1704153600,open:9,high:10,low:8,close:9,volume:100},{time:1704240000,open:9,high:11,low:8,close:10,volume:100}];
 const props:any={open:true,onClose:vi.fn(),alerts:[] as LocalAlert[],dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,enabled:true,suspended:false,backgroundSave:false,assertContextCurrent:vi.fn(),onContextComplete:vi.fn()};
 props.onAlertsChange=vi.fn((next:LocalAlert[],base:LocalAlert[])=>{if(base!==props.alerts)return false;props.alerts=next;return true;});
 const sma={id:'sma-1',kind:'sma',inputs:{length:2,source:'close'},plots:{},offset:0,visible:true};
 props.chart={getSourceContext:()=>sourceContextForDataset(dataset,props.bars),getStyle:()=>'candles',getDataWindow:()=>({pending:false,series:{count:props.bars.length,firstTime:props.bars[0]?.time??null,lastTime:props.bars.at(-1)?.time??null,style:'candles'}}),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({drawings:[]}),indicators:{serialize:()=>[sma],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{}};
 let child:AlertDialogProps|null=null;
 const view=mountControlledComponent(()=>{const element=WorkspaceAlerts(props) as unknown as {props:AlertDialogProps};child=element.props;return AlertDialog(element.props);});
 const pump=()=>{for(let pass=0;pass<16;pass++){const writes=view.owner.writes;view.render();for(const effect of view.owner.pending.splice(0))effect();if(view.owner.writes===writes)return;}throw Error('Synthetic state kept changing');};
 const settle=async()=>{for(let pass=0;pass<8;pass++){pump();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();await vi.advanceTimersByTimeAsync(0);for(let i=0;i<10;i++)await Promise.resolve();}pump();};
 const labelled=(type:string,label:string)=>view.find(node=>node.type===type&&node.props['aria-label']===label);
 const has=(type:string,label:string)=>{try{labelled(type,label);return true;}catch{return false;}};
 const button=(name:string)=>view.find(node=>node.type==='button'&&(text(node.props.children)===name||node.props['aria-label']===name));
 const change=async(type:string,label:string,value:string)=>{(labelled(type,label).props.onChange as (event:{target:{value:string}})=>void)({target:{value}});await settle();};
 const click=async(name:string)=>{(button(name).props.onClick as ()=>void)();await settle();};
 const submit=async()=>{(view.find(node=>node.type==='form').props.onSubmit as (event:{preventDefault():void})=>void)({preventDefault(){}});await settle();};
 return {props,view,settle,labelled,has,button,change,click,submit,child:()=>child!};
}

it('"+ Add condition" builds an all-conditions alert: price level AND close crossing its SMA',async()=>{
 const ui=setup();await ui.settle();await ui.click('Create alert');
 expect(ui.has('select','Condition 2 source')).toBe(false);
 expect(text(ui.button('Add condition').props.children)).toBe('+ Add condition');
 await ui.click('Add condition');
 expect(ui.labelled('select','Condition 2 source').props.value).toBe('price:close:chart');
 // Condition 2: close crossing the chart's SMA (another source), which offers only crossing and greater/less.
 await ui.change('select','Condition 2 target','indicator:sma-1:sma');
 const operators=(ui.labelled('select','Condition 2 operator').props.children as Array<{props:{value:string}}>).map(option=>option.props.value);
 expect(operators).toEqual(['crossing','crossing-up','crossing-down','greater','less']);
 await ui.change('select','Condition 2 operator','crossing-up');
 await ui.change('select','Alert condition','greater');await ui.change('input','Alert level','5');
 expect(ui.child().context?.binding.source.kind,JSON.stringify(ui.child().diagnostics)).toBe('all');
 await ui.submit();
 expect(ui.props.alerts,ui.view.text()).toHaveLength(1);
 const definition=ui.props.alerts[0].definition,source=definition.observationBinding.source as Extract<AlertSourceSnapshot,{kind:'all'}>;
 expect(source.members.map(member=>member.kind)).toEqual(['price','comparison']);
 expect(definition.conditions).toEqual([{kind:'greater',value:5},{kind:'crossing-up',value:0}]);
 expect(definition.condition).toEqual({kind:'greater',value:5});
 expect(ui.view.text()).toContain('CLOSE (standard) greater than 5 and CLOSE (standard) crossing up SMA / sma (standard)');
});

it('conditions can be removed, are capped at five and are discarded with the draft',async()=>{
 const ui=setup();await ui.settle();await ui.click('Create alert');
 for(let i=0;i<4;i++)await ui.click('Add condition');
 expect(ui.has('select','Condition 5 source')).toBe(true);expect(ui.button('Add condition').props.disabled).toBe(true);
 await ui.change('input','Condition 3 level','7');
 await ui.click('Remove condition 2');
 expect(ui.has('select','Condition 5 source')).toBe(false);
 expect(ui.labelled('input','Condition 2 level').props.value,'the third condition moved up with its value').toBe('7');
 expect(ui.button('Add condition').props.disabled).toBe(false);
 await ui.click('Cancel');await ui.click('Create alert');
 expect(ui.has('select','Condition 2 source')).toBe(false);
});

it('the qualified-source note names the week or month of a 1W or 1M source',()=>{
 const source=(interval:'1D'|'1W'|'1M')=>({kind:'indicator',instanceId:'i',snapshotId:'s',indicator:'sma',plotId:'sma',inputs:{length:2,source:'close'},inputBasis:'standard-ohlc',transformId:'standard',calculation:{schemaVersion:1,interval,calendar:'nyse-regular',sampling:'observed-prefix',waitForClose:true}}) as AlertSourceSnapshot;
 expect(qualifiedSourceNote(source('1D'))).toContain('regular-session daily prices. Once per bar refers to the daily session.');
 expect(qualifiedSourceNote(source('1W'))).toContain('regular-session weekly prices. Once per bar refers to the week. Once per bar close waits for a genuine observed close of the week;');
 expect(qualifiedSourceNote(source('1M'))).toContain('regular-session monthly prices. Once per bar refers to the month.');
});

// Background (non-charted symbol) evaluation.
const bucket=Math.floor(Date.now()/300000)*300,T=bucket-300*30;
const bar=(time:number,close:number):Bar=>({time,open:close,high:close+0.5,low:close-0.5,close,volume:100});
function feedOf(initial:BarDataset){
 let data=initial;const listeners=new Set<(dataset:BarDataset)=>void>();
 const handle:LiveHandle={datasetId:initial.provenance.datasetId,dataset:()=>data,formingTime:()=>null,onChange:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},close(){/* test feed */}};
 return {handle,push(close:number){data={...data,bars:[...data.bars.slice(-20),bar(data.bars.at(-1)!.time+300,close)]};for(const listener of [...listeners])listener(data);}};
}
it('an all-conditions alert is watched and fires in the background only when every condition holds',async()=>{
 const base=liveLike('GME'),close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'},high:AlertSourceSnapshot={kind:'price',field:'high',transformId:'standard'};
 const group:AlertSourceSnapshot={kind:'all',snapshotId:'g',members:[close,high] as AlertConditionSource[]};
 const conditions=[{kind:'crossing-up' as const,value:10},{kind:'greater' as const,value:11.6}];
 const alerts=[alertOn(base,'m',{condition:conditions[0],conditions},group)];
 expect(planBackgroundAlertFeeds({alerts,activeInstrumentId:'',openAlpacaSymbols:new Set(['GME'])}).feeds.map(feed=>feed.alertIds)).toEqual([['m']]);
 const feed=feedOf({...base,bars:[bar(T,9),bar(T+300,9.1)]});let saved=alerts;
 const watcher=new BackgroundAlertWatcher({open:()=>feed.handle,alerts:()=>saved,publish:(next,expected)=>{if(expected!==saved)return false;saved=next;return true;},now:()=>Math.floor(Date.now()/1000),identity:()=>crypto.randomUUID(),openAlpacaSymbols:()=>new Set(['GME'])});
 disposers.push(()=>watcher.dispose());watcher.sync('');await watcher.settled();
 // 11 crosses 10 but its high 11.5 is not above 11.6; 11.2 crosses again with high 11.7.
 for(const value of [9.2,11,9,11.2]){feed.push(value);await watcher.settled();}
 const alert=saved.find(row=>row.definition.id==='m')!;
 expect(alert.history.map(item=>item.value)).toEqual([11.2]);
 expect(alert.history[0].observation!.operands!.conditions!.map(row=>row.left.value)).toEqual([11.2,11.7]);
});
