import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import type {BarDataset} from '../../src/domain/types';
// Screener Currency menu handler evidence (same controlled-hooks harness as g3-gaps-1028-dialogs). Not DOM or paint evidence.
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
const day=(iso:string)=>Date.parse(iso+'T00:00:00Z')/1000;
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const pick=(ui:ReturnType<typeof screener>,value:string)=>find(ui.render(),node=>node.props?.['aria-label']==='Currency').props.onChange(value);
const note=(ui:ReturnType<typeof screener>)=>{const hit=all(ui.render(),node=>node.props?.['aria-label']==='Currency conversion')[0];return hit?text(hit):'';};

describe('screener Currency menu',()=>{
 it('offers Default plus eight currencies, saves the choice and downloads only the needed FRED series once',async()=>{
  const fetchFredSeries=vi.fn(async({series}:{series:string})=>({ok:true,value:{schemaVersion:1,series,rows:[[day('2026-10-16'),1.1],[day('2026-10-19'),1.25]],fetchedAt:1,cached:false,stale:false}}));
  const ui=screener({fxBridge:{fetchFredSeries},fxEnabled:true});
  const options=find(ui.render(),node=>node.props?.['aria-label']==='Currency').props.options.map((option:any)=>option.value);
  expect(options).toEqual(['default','USD','EUR','JPY','GBP','AUD','CAD','CHF','CNY']);
  expect(note(ui)).toBe('');
  pick(ui,'EUR');
  expect(ui.props.settings.currency).toBe('EUR');
  ui.render();expect(note(ui)).toContain('Downloading rates.');
  await flush();ui.render();
  expect(fetchFredSeries.mock.calls.map(call=>call[0].series)).toEqual(['DEXUSEU']);
  expect(note(ui)).toContain('Money columns are in EUR; Last stays in each instrument');
  expect(note(ui)).not.toContain('Downloading');
  pick(ui,'USD');ui.render();await flush();
  expect(fetchFredSeries).toHaveBeenCalledTimes(1);
  pick(ui,'default');
  expect(ui.props.settings).not.toHaveProperty('currency');
  expect(note(ui)).toBe('');
 });
 it('makes no request when FRED downloads are off and says why',async()=>{
  const fetchFredSeries=vi.fn();
  const ui=screener({fxBridge:{fetchFredSeries},fxEnabled:false});
  pick(ui,'JPY');ui.render();await flush();
  expect(fetchFredSeries).not.toHaveBeenCalled();
  expect(note(ui)).toContain('FRED downloads are turned off');
 });
});
