import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScriptBindingRuntime,SCRIPT_BAR_LIMIT,scriptReadyMessage,SCRIPT_TAIL_NOTE} from '../../src/ui/script-binding-runtime';
import {strategyEmptyText} from '../../src/ui/StrategyDialog';
import {strategyReportRows} from '../../src/strategy-report/derived-rows';
import {readoutRetryDelay,READOUT_RETRY_LIMIT} from '../../src/ui/CellSeriesHeading';
import {MultiChartGrid,createMultiChartState,layoutPickQueue,RESIZE_SETTLE_MS,GRID_STRIP_BOUNDS,GRID_STRIP_LABEL,GRID_STRIP_CONTROL} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {logicalScriptFixture,logicalSourceRows} from '../fixtures/script-derived-position';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {BindingStatus} from '../../src/ui/script-binding-runtime';

// SYNTHETIC rows and fixtures only; no network.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(v:any)=>{hooks.cells[i]=typeof v==='function'?v(hooks.cells[i]):v;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;},useEffect:(fn:()=>unknown)=>{hooks.cursor++;hooks.effects.push(fn);}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const held:Array<{dispose():void}>=[];afterEach(()=>{vi.useRealTimers();for(const f of held.splice(0).reverse())f.dispose();});

const binding:ScriptBinding={id:'SYNTHETIC-rsi',documentId:'doc',version:1,name:'RSI strategy',source:'({onBar(ctx){ctx.plot("c",ctx.bar.close);}})',pane:'price',visible:true,plots:{}};
const port=()=>({add:()=>{},update:()=>{},remove:()=>{},replaceStyles:()=>{},show:()=>{},move:()=>{},place:()=>{},rename:()=>{}} as unknown as ChartController['scripts']);
const rising=(count:number)=>Array.from({length:count},(_,index)=>({time:100+60*index,open:10+index,high:10+index,low:10+index,close:10+index,volume:NaN}));

it('#2 root cause: a derived chart over 5,000 confirmed rows still mints its calculation receipt (it used to return null forever)',async()=>{
 const f=await logicalScriptFixture({rows:logicalSourceRows(Array.from({length:5004},(_,index)=>10+2*index))});held.push(f);
 const receipt=f.produced.capture({input:f.input,execution:'ordinary'});
 expect(receipt?.isCurrent()).toBe(true);expect(receipt!.bars.length).toBeGreaterThan(SCRIPT_BAR_LIMIT);
});
it('#2: over the execution limit the job runs on the newest 5,000 bars, with no error',()=>{
 const statuses:BindingStatus[][]=[],execute=vi.fn((_input:{bars:readonly {time:number}[]})=>new Promise(()=>{}));const runtime=new ScriptBindingRuntime(port(),rows=>statuses.push(rows),()=>{},execute as never);
 const bars=rising(SCRIPT_BAR_LIMIT+1);runtime.update({bars,identity:'SYNTHETIC',fixture:true,bindings:[binding],ready:true});// the logical (derived) path runs end to end in script-tail-run.test.ts
 expect(execute).toHaveBeenCalledTimes(1);const ran=execute.mock.calls[0][0].bars;expect(ran).toHaveLength(SCRIPT_BAR_LIMIT);expect(ran[0].time).toBe(bars[1].time);expect(ran.at(-1)!.time).toBe(bars.at(-1)!.time);
 expect(statuses.flat().some(row=>row.status==='error')).toBe(false);expect(runtime.calculationSummary()).toEqual({pending:['RSI strategy'],failed:[]});
 expect(scriptReadyMessage(2,5000,true)).toBe('2 plots on 5000 supplied bars. '+SCRIPT_TAIL_NOTE);expect(scriptReadyMessage(2,40,false)).toBe('2 plots on 40 supplied bars.');
 runtime.dispose();
});
it('#2: at the limit the job still runs (no new refusal at exactly 5,000 rows)',()=>{
 const execute=vi.fn(()=>new Promise(()=>{}));const runtime=new ScriptBindingRuntime(port(),()=>{},()=>{},execute as never);
 runtime.update({bars:rising(SCRIPT_BAR_LIMIT),identity:'SYNTHETIC',fixture:true,bindings:[binding],ready:true});
 expect(execute).toHaveBeenCalledTimes(1);expect(runtime.calculationSummary()).toEqual({pending:['RSI strategy'],failed:[]});runtime.dispose();
});

function grid(request:(...args:any[])=>Promise<boolean>){const gme=fixtureDataset('GME',3),state=createMultiChartState(gme,{appearance:defaultTheme.appearance});const props:any={state,datasets:[gme],onChange:()=>true,onRequestResize:vi.fn(request),onReady:()=>{},onActiveCell:()=>{}};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};const find=(node:any):any=>{if(Array.isArray(node)){for(const child of node){const hit=find(child);if(hit)return hit;}}else if(node?.props){if(node.props['aria-label']==='Chart layout')return node;return find(node.props.children);}return null;};
 const choose=(value:string)=>find(render()).props.onChange({target:{value}});const error=()=>hooks.cells.find(cell=>typeof cell==='string'&&cell.length>0)??'';return{props,choose,error};}
// The layout pick queue is shared by the trees of one window; each test starts from an idle queue (a request
// left unsettled under fake timers would otherwise hold it for the next test).
beforeEach(()=>{layoutPickQueue.running=0;layoutPickQueue.pending=null;});
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
it('#2: a layout request that never settles releases the resize hold after RESIZE_SETTLE_MS, with a message, and the next try is sent',async()=>{
 vi.useFakeTimers();const g=grid(()=>new Promise<boolean>(()=>{}));
 g.choose('two-columns');await settle();expect(g.props.onRequestResize).toHaveBeenCalledTimes(1);
 /* A pick during a running change is queued, not refused; a change that never settles drops it. */g.choose('two-columns');await settle();expect(g.props.onRequestResize).toHaveBeenCalledTimes(1);expect(g.error()).toBe('');
 await vi.advanceTimersByTimeAsync(RESIZE_SETTLE_MS);expect(g.error()).toMatch(/did not finish within 20 seconds and was released/);
 g.choose('two-columns');await settle();expect(g.props.onRequestResize).toHaveBeenCalledTimes(2);
});
it('#2: a repeated refusal reads differently, so a second try never looks like nothing happened',async()=>{
 const g=grid(async()=>false);
 g.choose('two-columns');await settle();expect(g.error()).toBe('Could not change the layout. Your saved layout is unchanged.');
 g.choose('two-columns');await settle();expect(g.error()).toMatch(/^Could not change the layout\. Your saved layout is unchanged\. Tried again at .+\.$/);
});
it('#6: a heading read that missed retries on a bounded schedule',()=>{
 expect(readoutRetryDelay(0)).toBe(100);expect(readoutRetryDelay(19)).toBe(100);expect(readoutRetryDelay(20)).toBe(500);
 let total=0;for(let attempt=0;attempt<READOUT_RETRY_LIMIT;attempt++)total+=readoutRetryDelay(attempt);expect(total).toBe(17000);
});
it('#6: the per-chart strip stays inside its cell and its symbol | interval label never shrinks',()=>{
 expect(GRID_STRIP_BOUNDS).toMatchObject({minWidth:0,overflow:'hidden',maxWidth:'100%'});expect(GRID_STRIP_LABEL).toMatchObject({flex:'0 0 auto',whiteSpace:'nowrap'});expect(GRID_STRIP_CONTROL).toMatchObject({minWidth:0,flex:'0 1 auto'});
});
it('#7: the empty report says "Add a strategy" only when the chart has none',()=>{
 expect(strategyEmptyText(undefined,null)).toBe('Add a strategy to see results');expect(strategyEmptyText([],null)).toBe('Add a strategy to see results');
 const two=[{id:'a',name:'RSI strategy (1)'},{id:'b',name:'RSI strategy (2)'}];
 expect(strategyEmptyText(two,'b')).toMatch(/^No results for RSI strategy \(2\) yet\./);
 expect(strategyEmptyText([two[0]],null)).toMatch(/^No results for RSI strategy \(1\) yet\./);
 expect(strategyEmptyText(two,null)).toMatch(/^No strategy results yet\./);
});
it('#7: derived rows reach the report with volume carried as zero; valid rows stay the same objects',()=>{
 const good={time:1,open:1,high:1,low:1,close:1,volume:5},rows=strategyReportRows([good,{...good,time:2,volume:NaN},{...good,time:3,volume:-1}]);
 expect(rows[0]).toBe(good);expect(rows.map(row=>row.volume)).toEqual([5,0,0]);expect(rows.every(row=>Object.values(row).every(Number.isFinite))).toBe(true);
});
