import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StrategyDialog,type StrategyDialogProps,type StrategyExecution} from '../../src/ui/StrategyDialog';
import {backtestStrategy,DEFAULT_STRATEGY_CONFIG,type StrategyConfig} from '../../src/domain/strategy';
import {StrategyReportWorkerSession} from '../../src/strategy-report/worker-core';
import type {ReportReply} from '../../src/strategy-report/types';
import {ReportLoopbackPort} from './strategy-report-test-port';
// The Metrics overview, metric table and equity plot are computed from the accepted run, through the
// actual component handlers (controlled hooks, same harness as strategy-dialog-handlers) and the real worker session.
// No DOM, native focus, keyboard or packaged window is exercised.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[]}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const same=(a:any[]|undefined,b:any[]|undefined)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
 return {...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:(factory:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
  useEffect:(effect:any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||!same(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};hooks.cells[index]=cell;hooks.effects.push(()=>{cell.cleanup?.();cell.cleanup=effect();});}},
 };
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function all(node:any,predicate:(value:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)all(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);all(node.props.children,predicate,out);}return out;}
function execution(closes:number[],id:string):StrategyExecution{
 const bars=closes.map((close,index)=>({time:1000+index*60,open:close,high:close,low:close,close,volume:1})),barIds=bars.map((_,index)=>id+':'+index);
 return {bars,barIds,identity:id,source:'Explicit synthetic provider; no real security prices',currency:null,timezone:'UTC',chartType:'standard',result:{plots:[],alerts:[],state:null,diagnostics:[],elapsedMs:0,provisional:false,provenance:{kind:'synthetic',label:'Synthetic overview test'},orders:[{sequence:1,side:'buy',quantity:2,event:{id:barIds[0],revision:1,time:bars[0].time},virtual:true},{sequence:2,side:'sell',quantity:2,event:{id:barIds[1],revision:1,time:bars[1].time},virtual:true}]}};
}
function setup(first:StrategyExecution){
 const props:StrategyDialogProps={execution:first,config:{...DEFAULT_STRATEGY_CONFIG,commission:{kind:'fixed',value:0},initialCapital:1000},onChange:vi.fn((_config:StrategyConfig)=>true),onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return StrategyDialog(props);};
 const flush=()=>{const effects=hooks.effects.splice(0);for(const effect of effects)effect();};
 const ready=async()=>{render();flush();for(let i=0;i<80;i++){await new Promise(resolve=>setTimeout(resolve,5));const tree=render();flush();if(!find(tree,node=>node.type==='button'&&text(node)==='Export metrics CSV')?.props.disabled)return;}throw Error('Report did not become ready');};
 const cards=()=>Object.fromEntries(all(find(render(),node=>node.props?.className==='performance-cards').props.children,node=>node.type==='div').map(card=>[text(card.props.children[0]),text(card.props.children[1])]));
 const row=(label:string)=>{const tr=find(render(),node=>node.type==='tr'&&text(node.props.children?.[0])===label);if(!tr)throw Error('Missing metric row '+label);return text(tr.props.children[1]);};
 return {props,render,flush,ready,cards,row};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('window',{lv:{exportData:vi.fn()}});vi.stubGlobal('Worker',ReportLoopbackPort);});
afterEach(()=>{for(const cell of hooks.cells)if(cell&&typeof cell==='object'&&typeof cell.cleanup==='function')cell.cleanup();vi.unstubAllGlobals();});

it('shows overview cards computed from the accepted run and recomputes them for a different run', async () => {
 // Buy 2 at the bar-1 open (100), sell 2 at the bar-2 open: +2 x (120 - 100) = 40; then +2 x (90 - 100) = -20.
 const ui=setup(execution([100,100,120],'synthetic-overview-a'));await ui.ready();
 const first=ui.cards();expect(first['Net closed PnL']).toBe((40).toLocaleString(undefined,{maximumFractionDigits:2}));expect(first['Total closed trades']).toBe('1');expect(first['Profitable (%)']).toBe((100).toLocaleString(undefined,{maximumFractionDigits:2}));
 ui.props.execution=execution([100,100,90],'synthetic-overview-b');ui.flush();await ui.ready();
 const second=ui.cards();expect(second['Net closed PnL']).toBe((-20).toLocaleString(undefined,{maximumFractionDigits:2}));expect(second['Profitable (%)']).toBe((0).toLocaleString(undefined,{maximumFractionDigits:2}));expect(second['Maximum close drawdown']).toBe((20).toLocaleString(undefined,{maximumFractionDigits:2}));
});

it('lists close-to-close and intrabar drawdown as distinct computed rows, with durations in calendar days', async () => {
 const ui=setup(execution([100,100,90],'synthetic-overview-c'));await ui.ready();
 expect(ui.row('Maximum close drawdown')).toBe((20).toLocaleString(undefined,{maximumFractionDigits:6})+' currency');
 // Reference intrabar formula: realized equity 1000 at entry plus 2 x (100 - 90) adverse = 20; percent of initial 2.
 expect(ui.row('Maximum intrabar drawdown')).toBe((20).toLocaleString(undefined,{maximumFractionDigits:6})+' currency');
 expect(ui.row('Maximum intrabar drawdown / initial capital')).toBe((2).toLocaleString(undefined,{maximumFractionDigits:6})+' percent');
 expect(ui.row('Average close drawdown')).toBe('Unavailable (undefined)');expect(ui.row('Margin calls')).toBe('0 count');expect(ui.row('Margin efficiency')).toBe('Unavailable (unavailable)');
});

it('plots the virtual equity series at every supplied valuation close through the worker session', () => {
 const closes=[100,100,120,110],run=execution(closes,'synthetic-equity'),bars=run.bars;
 const session=new StrategyReportWorkerSession();let sequence=0;const send=(fields:Record<string,unknown>):ReportReply=>session.handle({version:1,job:'synthetic-equity-plot',sequence:++sequence,...fields});
 const config={...DEFAULT_STRATEGY_CONFIG,initialCapital:1000};
 send({kind:'start',input:{context:{executionId:'synthetic-equity',sourceLabel:'Synthetic equity plot',currency:null,timezone:'UTC'},config,chartType:'standard',counts:{bars:bars.length,standardBars:0,barIds:bars.length,proposals:2}}});
 send({kind:'chunk',section:'bars',start:0,rows:bars});send({kind:'chunk',section:'barIds',start:0,rows:run.barIds});send({kind:'chunk',section:'proposals',start:0,rows:run.result.orders});
 expect(send({kind:'seal'})).toMatchObject({ok:true,kind:'ready'});
 const plot=send({kind:'plot',query:{series:'equity',percent:false,benchmark:false,favorable:false,adverse:false}}) as any;
 // Equity = cash + position x close: 1000, 1000 (bought 2 at 100), 1040 (sold at 120 on bar 2 open; flat), 1040.
 expect(plot.value.values.map((point:any)=>[point.index,point.value])).toEqual([[0,1000],[1,1000],[2,1040],[3,1040]]);
 const engine=backtestStrategy({bars,signals:[{barIndex:0,orders:[{action:'buy',quantity:2}]},{barIndex:1,orders:[{action:'sell',quantity:2}]}],config});expect(engine.equity.map(row=>row.equity)).toEqual([1000,1000,1040,1040]);
 const inspect=send({kind:'inspect',barIndex:2}) as any;expect(inspect.value.point).toMatchObject({barId:'synthetic-equity:2',time:1120,equity:1040});
});

it('opens the same Properties from the report initial-capital and execution shortcuts, and maps the limit-fill rule to the engine', async () => {
 const ui=setup(execution([100,100,120],'synthetic-shortcuts'));await ui.ready();
 const shortcut=(prefix:string)=>{const node=find(ui.render(),value=>value.type==='button'&&text(value).startsWith(prefix));if(!node)throw Error('Missing shortcut '+prefix);return node;};
 expect(text(shortcut('Initial capital'))).toBe('Initial capital '+(1000).toLocaleString(undefined,{maximumFractionDigits:2}));expect(text(shortcut('Execution:'))).toBe('Execution: next bar open');
 shortcut('Initial capital').props.onClick();
 const label=(prefix:string)=>find(ui.render(),node=>node.type==='label'&&text(node).startsWith(prefix));
 label('Initial virtual capital').props.children[1].props.onChange({target:{value:'2500'}});
 const limit=find(ui.render(),node=>node.type==='select'&&node.props['aria-label']==='Limit order fills');expect(limit.props.value).toBe('touch');limit.props.onChange({target:{value:'through'}});
 expect(find(ui.render(),node=>node.type==='select'&&node.props['aria-label']==='Limit order fills').props.value).toBe('through');
 find(ui.render(),node=>node.type==='button'&&text(node)==='Apply properties').props.onClick();
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(vi.mocked(ui.props.onChange).mock.calls[0][0]).toMatchObject({initialCapital:2500,limitVerifyTicks:1});
 ui.props.execution=execution([100,100,120],'synthetic-shortcuts-b');ui.flush();await ui.ready();shortcut('Execution:').props.onClick();expect(find(ui.render(),node=>node.type==='button'&&text(node)==='Apply properties')).toBeTruthy();
});

it('words the entry notional basis on the Trades tab', async () => {
 // LV's own computation (src/domain/strategy-report.ts), in original LV wording; no the reference app claim.
 const ui=setup(execution([100,100,120],'synthetic-notional'));await ui.ready();
 find(ui.render(),node=>node.type==='button'&&node.props.className!==undefined&&text(node)==='Trades').props.onClick();ui.flush();
 await ui.ready();
 const help=all(ui.render(),node=>node.type==='p'&&node.props.className==='help').map(node=>text(node.props.children));
 const notional=help.find(line=>/entry notional/i.test(line));
 expect(notional,help.join(' | ')).toBeTruthy();
 expect(notional).toMatch(/units?\b.*entry (fill )?price/i);
 expect(notional).toMatch(/fees? (are |is )?(excluded|not included)/i);
 expect(notional).toMatch(/Return %.*Net PnL.*entry notional/i);
 expect(notional).not.toMatch(/—/);
});
