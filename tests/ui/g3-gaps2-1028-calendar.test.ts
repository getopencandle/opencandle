import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {ReactElement} from 'react';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {createCalendarState,parseCalendarJson,type CalendarState} from '../../src/domain/calendar';
import {calendarEconomicSeries,economicSeriesInfo} from '../../src/domain/calendar-economic';

// Economic row expansion, Launch chart, See overview and the resizable sheet. Same controlled-hooks harness as
// tests/ui/calendar-dialog-workflow.test.ts (handler evidence, no DOM or paint).
// handler evidence only, not GUI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function all(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>[]{const found:ReactElement<any>[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found.push(node);visit(node.props.children);};visit(tree);return found;}
function find(tree:any,match:(node:ReactElement<any>)=>boolean){const found=all(tree,match)[0];if(!found)throw Error('Calendar handler target missing.');return found;}
function mount(props:any){
 const render=()=>{hooks.cursor=0;return CalendarDialog(props) as any;};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&(text(node.props.children)===label||node.props['aria-label']===label));
 const field=(label:string)=>find(render(),node=>node.props['aria-label']===label);
 return {props,render,button,field,
  click:(label:string)=>button(label).props.onClick(),
  change:(label:string,value:string)=>field(label).props.onChange({target:{value}}),
  check:(label:string,checked:boolean)=>field(label).props.onChange({target:{checked}}),
  tab:(label:string)=>find(render(),node=>node.props.role==='tab'&&text(node.props.children)===label),
  headers:()=>all(render(),node=>node.type==='th').map(node=>text(node.props.children)).filter(Boolean),
  body:()=>text(render()),
  alert:()=>text(find(render(),node=>node.props.role==='alert')),
  draft:()=>hooks.cells[1] as CalendarState, // cell 0 holds the saved baseline
 };
}
const NOW=Date.parse('2026-06-10T12:00:00Z')/1000;
const EVENTS=[
 {id:'cpi',kind:'economic',title:'CPI (YoY)',description:'Headline consumer prices.',date:'2026-06-10',country:'US',importance:'high'},
 {id:'core',kind:'economic',title:'Core CPI (MoM)',date:'2026-06-10',country:'US'},
 {id:'fred',kind:'economic',title:'Ten-year yield print',date:'2026-06-10',country:'XA',symbol:'FRED:DGS10'},
 {id:'none',kind:'economic',title:'Mystery index',date:'2026-06-10',country:'XA'},
 {id:'foreign',kind:'economic',title:'CPI (YoY)',date:'2026-06-10',country:'DE'},
];
function state():CalendarState{const parsed=parseCalendarJson(JSON.stringify(EVENTS),{documentId:'g3',sourceLabel:'Test import',now:NOW-60});return {...createCalendarState(),documents:[parsed.document!],query:{...createCalendarState().query,kind:'economic'}};}
const row=(id:string)=>({kind:'economic' as const,symbol:null,country:null,category:null,title:'',...EVENTS.find(event=>event.id===id)});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

describe('economic series for a calendar row',()=>{
 it('takes an explicit FRED symbol as exact and matches US headline releases by name',()=>{
  expect(calendarEconomicSeries(row('fred') as any)).toMatchObject({series:'DGS10',symbol:'FRED:DGS10',basis:'exact',units:'percent'});
  expect(calendarEconomicSeries(row('cpi') as any)).toMatchObject({series:'CPIAUCSL',basis:'matched',frequency:'monthly',url:'https://fred.stlouisfed.org/series/CPIAUCSL'});
  expect(calendarEconomicSeries(row('core') as any)?.series).toBe('CPILFESL');
  for(const [title,series] of [['Nonfarm Payrolls','PAYEMS'],['Initial Jobless Claims','ICSA'],['GDP Growth Rate QoQ Adv','A191RL1Q225SBEA'],['Fed Interest Rate Decision','DFEDTARU'],['Unemployment Rate','UNRATE'],['Retail Sales MoM','RSAFS']])
   expect(calendarEconomicSeries({kind:'economic',symbol:null,country:'United States',category:null,title} as any)?.series).toBe(series);
 });
 it('never invents a series: other countries, unmatched names, corporate kinds and bad ids give none',()=>{
  expect(calendarEconomicSeries(row('foreign') as any)).toBeNull();
  expect(calendarEconomicSeries(row('none') as any)).toBeNull();
  expect(calendarEconomicSeries({...row('cpi'),kind:'earnings'} as any)).toBeNull();
  expect(calendarEconomicSeries({...row('fred'),symbol:'FRED:bad id!'} as any)).toBeNull();
  expect(economicSeriesInfo('ZZZ1').description).toBe('FRED economic series ZZZ1');
 });
});

describe('calendar economic row actions',()=>{
 it('expands a row into description, Launch chart and See overview, and launches the exact series',()=>{
  const onOpenSeries=vi.fn(()=>true),onClose=vi.fn();
  const ui=mount({state:state(),onChange:vi.fn(),onClose,now:NOW,onSelectSymbol:vi.fn(),onOpenSeries});
  const title=find(ui.render(),node=>node.type==='button'&&text(node.props.children)==='CPI (YoY)'&&node.props['aria-expanded']!==undefined);
  expect(title.props['aria-expanded']).toBe(false);title.props.onClick();
  const details=text(find(ui.render(),node=>node.props['aria-label']==='Calendar event details'));
  expect(details).toContain('Headline consumer prices.');
  const launch=find(ui.render(),node=>node.type==='button'&&text(node.props.children)==='Launch chart FRED:CPIAUCSL');
  expect(launch.props.title).toContain('Matched by the release name');
  ui.click('See overview');
  const overview=text(find(ui.render(),node=>node.props['aria-label']==='Economic series overview'));
  expect(overview).toContain('FRED:CPIAUCSL');expect(overview).toContain('Units index');expect(overview).toContain('monthly');expect(overview).toContain('fred.stlouisfed.org/series/CPIAUCSL');
  ui.click('Launch chart FRED:CPIAUCSL');
  expect(onOpenSeries).toHaveBeenCalledWith('CPIAUCSL');expect(onClose).toHaveBeenCalled();
 });
 it('uses an explicit FRED symbol, keeps the dialog open with a message when the host refuses, and explains when nothing matches',()=>{
  const onOpenSeries=vi.fn(()=>false),onClose=vi.fn(),onSelectSymbol=vi.fn();
  const ui=mount({state:state(),onChange:vi.fn(),onClose,now:NOW,onSelectSymbol,onOpenSeries});
  ui.click('Ten-year yield print');ui.click('Launch chart FRED:DGS10');
  expect(onOpenSeries).toHaveBeenCalledWith('DGS10');expect(onSelectSymbol).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
  expect(ui.alert()).toContain('could not open this series');
  ui.click('Mystery index');
  const details=text(find(ui.render(),node=>node.props['aria-label']==='Calendar event details'));
  expect(details).toContain('Launch chart is unavailable: this event has no chart symbol and no matching economic series.');
  expect(details).toContain('See overview is unavailable');
 });
 it('says the series action is missing when the host provides none',()=>{
  const ui=mount({state:state(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  ui.click('Ten-year yield print');
  expect(text(find(ui.render(),node=>node.props['aria-label']==='Calendar event details'))).toContain('the host did not provide a series chart action');
 });
 it('keeps the calendar sheet vertically resizable (AN.CALENDAR.ECON.RESIZE)',()=>{
  const css=readFileSync('src/ui/calendar.css','utf8');
  expect(css).toMatch(/\.lv-calendar \.table-scroll\{[^}]*resize:vertical[^}]*min-height:120px/);
  expect(css).toMatch(/\.lv-calendar \.table-scroll\.lv-calendar-table-empty\{[^}]*resize:none/);
  const ui=mount({state:state(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  expect(all(ui.render(),node=>typeof node.props.className==='string'&&node.props.className.split(' ').includes('table-scroll')).length).toBe(1);
 });
});
