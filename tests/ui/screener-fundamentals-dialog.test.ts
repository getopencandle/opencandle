import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';
import {createFundamentalsPreferences} from '../../src/fundamentals/preferences';
import type {BarDataset} from '../../src/domain/types';
// Actual ScreenerDialog render with controlled hooks (same harness as screener-sets-earnings). Not DOM or App wiring evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),
 useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){old?.cleanup?.();const cleanup=effect();hooks.cells[i]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}}
};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function make(symbol:string,closes:number[]):BarDataset{
 return{instrument:{id:'NASDAQ:'+symbol,symbol,name:symbol,exchange:'NASDAQ',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:closes.map((close,index)=>({time:Date.parse('2025-03-03T00:00:00Z')/1000+index*86400,open:close,high:close+1,low:close-0.5,close,volume:100})),resolution:'1D',
  provenance:{providerId:'prov',providerName:'Test import',datasetId:'prov:'+symbol,fixture:false,coverage:closes.length+' rows',asOf:0,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'test',revision:'r1',notes:[]}} as BarDataset;
}
const A=make('AAA',[10,12]),C=make('CCC',[20,18]);
// SYNTHETIC values in a local-import document: FY2024 revenue 1000, net income 250 (net margin 25%).
const fy=(val:number)=>({units:{USD:[{start:'2024-01-01',end:'2024-12-31',val,filed:'2025-02-20',form:'10-K'}]}});
const doc:FactsDocument={id:'d1',facts:normalizeCompanyFacts({cik:42,entityName:'Test Co',facts:{'us-gaap':{Revenues:fy(1000),NetIncomeLoss:fy(250)}}}),source:{kind:'local-import',label:'test import',retrievedAt:'2025-03-01T00:00:00Z',sourceUrl:null,sha256:null}};
const prefs={...createFundamentalsPreferences(),links:[{exchange:'NASDAQ',symbol:'AAA',synthetic:false,documentId:'d1'}]};
function setup(extra:Partial<ScreenerDialogProps>={}){
 const props:any={datasets:[A,C],settings:createScreenerSettings(),onClose:vi.fn(),onSelect:vi.fn(()=>({ok:true})),onChange:vi.fn((next:ScreenerSettings)=>{props.settings=next;return true;}),...extra};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const row=(id:string)=>{const node=find(render(),node=>node.type==='tr'&&node.key===id);if(!node)throw new Error('Missing row '+id);return node;};
 const control=(label:string)=>{const node=find(render(),node=>node.props?.['aria-label']===label);if(!node)throw new Error('Missing control '+label);return node.props;};
 return{props,render,row,control};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});afterEach(()=>hooks.cleanups.forEach(cleanup=>cleanup()));
it('the Margins set reads linked saved facts; unlinked symbols show a dash with the reason',()=>{
 const ui=setup({fundamentals:[doc],fundamentalsPreferences:prefs});
 ui.control('Column set').onChange('margins');
 expect(ui.props.settings.columns.map((column:any)=>column.metric)).toEqual(['symbol','last','grossMargin','operatingMargin','pretaxMargin','netMargin']);
 const linked=ui.row('NASDAQ:AAA'),net=find(linked,node=>node.type==='td'&&text(node)==='25.00%');
 expect(net).toBeTruthy();expect(net.props.title).toContain('Imported companyfacts: Test Co (CIK 0000000042), filings on or before');
 const dash=find(ui.row('NASDAQ:CCC'),node=>node.type==='td'&&text(node)==='-');
 expect(dash.props.title).toMatch(/No saved company facts are linked to NASDAQ:CCC/);
 hooks.cells=[];
 const none=setup();none.control('Column set').onChange('valuation');
 expect(find(none.row('NASDAQ:AAA'),node=>node.type==='td'&&node.props.title?.includes('not connected'))).toBeTruthy();
});
