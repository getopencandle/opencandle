import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import {createCalendarState,createSyntheticCalendarDemo,type CalendarState} from '../../src/domain/calendar';
import type {BarDataset} from '../../src/domain/types';
// Handler evidence with controlled hooks (same harness as screener-sets-earnings / calendar-1027-dialog). Not DOM or paint evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(node:any,predicate:(node:any)=>boolean,found:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>all(child,predicate,found));else if(node?.props){if(predicate(node))found.push(node);all(node.props.children,predicate,found);}return found;}
const find=(node:any,predicate:(node:any)=>boolean)=>{const hit=all(node,predicate)[0];if(!hit)throw new Error('missing target');return hit;};
const button=(tree:any,label:string)=>find(tree,node=>node.type==='button'&&(text(node.props.children)===label||node.props['aria-label']===label));
function make(symbol:string,name:string):BarDataset{
 return{instrument:{id:'NASDAQ:'+symbol,symbol,name,exchange:'NASDAQ',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:[10,12].map((close,index)=>({time:Date.parse('2026-10-19T00:00:00Z')/1000+index*86400,open:close,high:close+1,low:close-0.5,close,volume:100})),resolution:'1D',
  provenance:{providerId:'prov',providerName:'Test import',datasetId:'prov:'+symbol,fixture:false,coverage:'2 rows',asOf:0,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'test',revision:'r1',notes:[]}} as BarDataset;
}
const A=make('AAA','Alpha Widgets'),B=make('BBB','Beta Tools'),C=make('CCC','Gamma Alpha');
function screener(extra:Partial<ScreenerDialogProps>={}){
 const props:any={datasets:[A,B,C],settings:createScreenerSettings(),onClose:vi.fn(),onSelect:vi.fn(()=>({ok:true})),onChange:vi.fn((next:ScreenerSettings)=>{props.settings=next;return true;}),...extra};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const rowIds=()=>all(render(),node=>node.type==='tr'&&typeof node.key==='string'&&node.key.startsWith('NASDAQ:')).map(node=>node.key);
 const search=(value:string)=>find(render(),node=>node.props?.['aria-label']==='Search screener results').props.onChange({target:{value}});
 return{props,render,rowIds,search};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

describe('screener result bar',()=>{
 it('quick search narrows rows by symbol, market or name and leaves the saved screen alone',()=>{
  const ui=screener();
  expect(ui.rowIds()).toHaveLength(3);
  ui.search('alpha');expect(ui.rowIds().sort()).toEqual(['NASDAQ:AAA','NASDAQ:CCC']);
  expect(text(ui.render())).toContain('2 of 3 shown');
  ui.search('nasdaq:bbb');expect(ui.rowIds()).toEqual(['NASDAQ:BBB']);
  ui.search('');expect(ui.rowIds()).toHaveLength(3);
  expect(ui.props.onChange).not.toHaveBeenCalled();
 });
 it('paused auto-refresh keeps the snapshot until Refresh',()=>{
  const ui=screener();
  expect(button(ui.render(),'Refresh').props.disabled).toBe(true);
  button(ui.render(),'Auto-refresh on').props.onClick();
  ui.props.datasets=[A];
  expect(ui.rowIds()).toHaveLength(3);
  expect(text(ui.render())).toContain('Newer local data available');
  button(ui.render(),'Refresh').props.onClick();
  expect(ui.rowIds()).toEqual(['NASDAQ:AAA']);
  expect(text(ui.render())).not.toContain('Newer local data available');
  button(ui.render(),'Auto-refresh off').props.onClick();
  ui.props.datasets=[A,B];expect(ui.rowIds()).toHaveLength(2);
 });
 it('copies the selected rows as EXCHANGE:SYMBOL',async()=>{
  const writeText=vi.fn(()=>Promise.resolve());vi.stubGlobal('navigator',{clipboard:{writeText}});
  const ui=screener();
  expect(button(ui.render(),'Copy symbols').props.disabled).toBe(true);
  const row=(id:string)=>find(ui.render(),node=>node.type==='tr'&&node.key===id);
  row('NASDAQ:AAA').props.onClick({target:{closest:()=>null},ctrlKey:false,metaKey:false,shiftKey:false});
  row('NASDAQ:CCC').props.onClick({target:{closest:()=>null},ctrlKey:true,metaKey:false,shiftKey:false});
  button(ui.render(),'Copy symbols').props.onClick();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(String((writeText.mock.calls[0] as unknown[])[0]).split(',').sort()).toEqual(['NASDAQ:AAA','NASDAQ:CCC']);
 });
});

const NOW=Date.parse('2026-06-10T12:00:00Z')/1000;
function calendar(state:CalendarState){
 const props={state,onChange:vi.fn(),onClose:vi.fn(),now:NOW};
 const render=()=>{hooks.cursor=0;return CalendarDialog(props) as any;};
 return{render,body:()=>text(render())};
}
describe('calendar day strip, day headers and importance levels',()=>{
 beforeEach(()=>{vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
 const demo=():CalendarState=>({...createCalendarState(),documents:[createSyntheticCalendarDemo(NOW)]});
 it('shows day header rows in date order and narrows to one day from the strip',()=>{
  const ui=calendar(demo());
  const headers=()=>all(ui.render(),node=>node.type==='tr'&&node.props.className==='lv-calendar-day').map(text);
  expect(headers().some(value=>value.startsWith('Today, Wed, Jun 10'))).toBe(true);
  const strip=find(ui.render(),node=>node.props?.['aria-label']==='Calendar days');
  const chips=all(strip,node=>node.type==='button');
  expect(text(chips[0])).toMatch(/^All days \d+$/);
  find(ui.render(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Tomorrow, Thu, Jun 11')).props.onClick();
  expect(headers()).toHaveLength(1);
  expect(headers()[0]).toMatch(/^Tomorrow, Thu, Jun 11/);
  button(ui.render(),'All days '+text(chips[0]).split(' ').pop()).props.onClick();
  expect(headers().length).toBeGreaterThan(1);
 });
 it('importance toggles hide lower levels and keep one level on',()=>{
  const ui=calendar(demo());
  expect(ui.body()).toContain('Synthetic demo: consumer price index');
  button(ui.render(),'Low importance').props.onClick();
  button(ui.render(),'Medium importance').props.onClick();
  expect(ui.body()).toContain('consumer price index');
  expect(ui.body()).toContain('Events without a supplied importance are hidden');
  const levels=find(ui.render(),node=>node.props?.['aria-label']==='Importance levels');
  expect(all(levels,node=>node.type==='button').map(node=>node.props['aria-pressed'])).toEqual([false,false,true]);
  button(ui.render(),'High importance').props.onClick();
  expect(all(find(ui.render(),node=>node.props?.['aria-label']==='Importance levels'),node=>node.type==='button').map(node=>node.props['aria-pressed'])).toEqual([false,false,true]);
 });
});
