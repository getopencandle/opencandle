import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import type {CalendarDocument} from '../../src/domain/calendar';
import type {BarDataset} from '../../src/domain/types';
// Actual ScreenerDialog handlers with controlled hooks (same harness as screener-watchlist-actions). Not DOM or App wiring evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),
 useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){old?.cleanup?.();const cleanup=effect();hooks.cells[i]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}}
};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function make(symbol:string,closes:number[]):BarDataset{
 return{instrument:{id:'NASDAQ:'+symbol,symbol,name:symbol,exchange:'NASDAQ',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:closes.map((close,index)=>({time:Date.parse('2026-10-19T00:00:00Z')/1000+index*86400,open:close,high:close+1,low:close-0.5,close,volume:100})),resolution:'1D',
  provenance:{providerId:'prov',providerName:'Test import',datasetId:'prov:'+symbol,fixture:false,coverage:closes.length+' rows',asOf:0,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'test',revision:'r1',notes:[]}} as BarDataset;
}
const A=make('AAA',[10,12]),C=make('CCC',[20,18]);
const calendar:CalendarDocument[]=[{schemaVersion:1,id:'cal',provenance:{kind:'local-import',label:'test',sourceUrl:null,importedAt:0,license:'test',fixture:false},events:[{id:'e1',revision:1,kind:'earnings',title:'AAA results',description:'',date:'2026-10-24',time:null,timezone:null,timing:'date-only',symbol:'AAA',instrumentId:null,country:null,category:null,importance:null,status:'scheduled',publishedAt:null,fiscalPeriod:null,exDate:null,payDate:null,exchange:null,values:{}}]}];
function setup(extra:Partial<ScreenerDialogProps>={}){
 const props:any={datasets:[A,C],settings:createScreenerSettings(),onClose:vi.fn(),onSelect:vi.fn(()=>({ok:true})),onChange:vi.fn((next:ScreenerSettings)=>{props.settings=next;return true;}),...extra};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const row=(id:string)=>{const node=find(render(),node=>node.type==='tr'&&node.key===id);if(!node)throw new Error('Missing row '+id);return node;};
 const control=(label:string)=>{const node=find(render(),node=>node.props?.['aria-label']===label);if(!node)throw new Error('Missing control '+label);return node.props;};
 const key=(value:string,target:any={closest:()=>null})=>find(render(),node=>node.props?.className==='screener-body').props.onKeyDown({key:value,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,nativeEvent:{isComposing:false},target,preventDefault:vi.fn(),stopPropagation:vi.fn()});
 return{props,render,row,control,key};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});afterEach(()=>hooks.cleanups.forEach(cleanup=>cleanup()));

it('Enter opens the chart for the one selected row, and not from a focused button',()=>{
 const ui=setup();
 ui.key('Enter');expect(ui.props.onSelect).not.toHaveBeenCalled();
 ui.key('ArrowDown');ui.key('Enter',{closest:(selector:string)=>selector.includes('button')?{}:null});expect(ui.props.onSelect).not.toHaveBeenCalled();
 ui.key('Enter');expect(ui.props.onSelect).toHaveBeenCalledWith(A);expect(ui.props.onClose).not.toHaveBeenCalled();/* the screener stays open after opening a row */
});
it('a column set swaps the visible columns and keeps the screen editable',()=>{
 const ui=setup();
 ui.control('Column set').onChange('performance');
 expect(ui.props.settings.columns.map((column:any)=>column.metric)).toEqual(['symbol','last','changePercent','performancePeriod','performancePeriod','performancePeriod','performancePeriod','performancePeriod','performancePeriod','volatility']);
 expect(ui.props.settings.columns.some((column:any)=>column.id===ui.props.settings.sort.columnId)).toBe(true);
});
it('earnings columns read the connected local calendar and stay unavailable without it',()=>{
 const settings={...createScreenerSettings(),columns:[{id:'symbol',metric:'symbol'},{id:'next',metric:'earningsUpcomingDays'}]};
 const connected=setup({settings,calendarDocuments:calendar});
 expect(text(connected.row('NASDAQ:AAA'))).toContain('4');
 expect(text(connected.row('NASDAQ:CCC'))).toContain('n/a');
 hooks.cells=[];
 const missing=setup({settings});
 expect(text(missing.row('NASDAQ:AAA'))).toContain('n/a');
});
