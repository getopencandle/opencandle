import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {CalendarDialog,CALENDAR_QUICK_PERIODS} from '../../src/ui/CalendarDialog';
import {createCalendarState,createSyntheticCalendarDemo,parseCalendarJson,type CalendarState} from '../../src/domain/calendar';

// Calendar handler evidence (same controlled-hooks harness as calendar-dialog-workflow.test.ts): quick period strip,
// stale-import note and opening the dialog on one entry. No DOM or paint is exercised.
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
function withDemo():CalendarState{return {...createCalendarState(),documents:[createSyntheticCalendarDemo(NOW)]};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

describe('calendar quick periods, stale note and focus',()=>{
 it('offers one-click periods and marks the active one',()=>{
  const view=mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  const strip=find(view.render(),node=>node.props['aria-label']==='Calendar quick periods');
  expect(all(strip,node=>node.type==='button').map(node=>text(node.props.children))).toEqual(['Yesterday','Today','Tomorrow','This week','Next week','Upcoming','Past']);
  expect(CALENDAR_QUICK_PERIODS).toHaveLength(7);
  find(view.render(),node=>node.type==='button'&&text(node.props.children)==='Next week'&&node.props['aria-pressed']!==undefined).props.onClick();
  expect(view.draft().query).toMatchObject({period:'next-week'});
  expect(find(view.render(),node=>node.type==='button'&&text(node.props.children)==='Next week'&&node.props['aria-pressed']!==undefined).props['aria-pressed']).toBe(true);
  expect(view.body()).toContain('Range 2026-06-15 to 2026-06-21');
 });
 it('says when the newest real import is a week old',()=>{
  const parsed=parseCalendarJson(JSON.stringify([{id:'a',kind:'economic',title:'Imported',date:'2026-05-01'}]),{documentId:'real',sourceLabel:'My file',now:NOW-10*86400});
  const view=mount({state:{...createCalendarState(),documents:[parsed.document!]},onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  expect(view.body()).toContain('Your newest calendar import is 10 days old');
  hooks.cells=[];
  expect(mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW}).body()).not.toContain('newest calendar import');
 });
 it('opens on one entry from a chart marker, with its details expanded',()=>{
  const state=withDemo(),document=state.documents[0],event=document.events.find(row=>row.kind==='dividend')!;
  const view=mount({state:{...state,query:{...state.query,kind:'economic',search:'zzz'}},onChange:vi.fn(),onClose:vi.fn(),now:NOW,focusEvent:{documentId:document.id,eventId:event.id}});
  view.render();expect(view.draft().query).toMatchObject({kind:'dividend',period:'all',search:''});
  expect(find(view.render(),node=>node.props['aria-label']==='Calendar event details')).toBeTruthy();
  hooks.cells=[];
  const missing=mount({state,onChange:vi.fn(),onClose:vi.fn(),now:NOW,focusEvent:{documentId:document.id,eventId:'gone'}});
  expect(missing.body()).toContain('That calendar entry is no longer in your saved calendar');
 });
});
