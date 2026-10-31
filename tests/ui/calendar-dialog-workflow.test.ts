import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {CalendarDialog,calendarTabColumns,resetCalendarFilters,selectCalendarKind,selectCalendarPeriod} from '../../src/ui/CalendarDialog';
import {createCalendarState,createSyntheticCalendarDemo,parseCalendarJson,type CalendarQuery,type CalendarState} from '../../src/domain/calendar';

// Real CalendarDialog handlers with controlled hooks (same harness style as
// tests/security/publication-rejection-dialogs.test.ts). No DOM, paint, focus,
// native picker, IPC or packaged executable is exercised: this is component
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
function withDemo():CalendarState{return {...createCalendarState(),documents:[createSyntheticCalendarDemo(NOW)]};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

describe('calendar tab, period and filter helpers',()=>{
 it('gives each tab the columns named in the public help articles',()=>{
  const labels=(kind:Parameters<typeof calendarTabColumns>[0])=>calendarTabColumns(kind).map(column=>column.label);
  expect(labels('economic')).toEqual(['Date and time','Country','Importance','Event','Actual','Forecast','Prior']);
  expect(labels('earnings')).toEqual(['Date and time','Symbol','Event','Fiscal period','Estimated EPS','Actual EPS','EPS surprise','Estimated revenue','Actual revenue','Revenue surprise','Market cap']);
  expect(labels('dividend')).toEqual(['Date and time','Symbol','Event','Amount','Ex-date','Pay date','Yield']);
  expect(labels('ipo')).toEqual(['Date and time','Symbol','Event','Exchange','Offer price','Shares offered','Deal amount','Market cap']);
 });
 it('drops High importance and foreign sort keys on a tab change, keeps period/timezone, and resets filters but not tab or timezone',()=>{
  const query:CalendarQuery={...createCalendarState().query,kind:'economic',highImportance:true,period:'this-week',timezone:'Asia/Tokyo',countries:['XA'],sort:{key:'importance',direction:'desc'}};
  expect(selectCalendarKind(query,'dividend')).toMatchObject({kind:'dividend',highImportance:false,period:'this-week',timezone:'Asia/Tokyo',countries:['XA'],sort:{key:'date',direction:'asc'}});
  expect(selectCalendarKind({...query,sort:{key:'exDate',direction:'desc'}},'dividend').sort).toEqual({key:'exDate',direction:'desc'});
  expect(selectCalendarKind(query,'all')).toMatchObject({highImportance:true,sort:{key:'importance',direction:'desc'}});
  expect(resetCalendarFilters(query)).toEqual({...createCalendarState().query,kind:'economic',timezone:'Asia/Tokyo'});
 });
 it('prefills Custom range from the replaced bounded range or today in the display timezone',()=>{
  const base=createCalendarState().query;
  expect(selectCalendarPeriod({...base,period:'this-week',timezone:'America/New_York'},'custom',NOW)).toMatchObject({period:'custom',from:'2026-06-08',to:'2026-06-14'});
  expect(selectCalendarPeriod({...base,period:'all',timezone:'Pacific/Kiritimati'},'custom',Date.parse('2026-06-10T11:00:00Z')/1000)).toMatchObject({from:'2026-06-11',to:'2026-06-11'});
  expect(selectCalendarPeriod({...base,period:'custom',from:'2026-01-01',to:'2026-01-31'},'custom',NOW)).toMatchObject({from:'2026-01-01',to:'2026-01-31'});
  expect(selectCalendarPeriod(base,'today',NOW)).toEqual({...base,period:'today'});
 });
});

describe('calendar dialog workflow through real handlers (not GUI evidence)',()=>{
 it('shows an actionable unavailable state, previews the labelled demo, and saves it only on Apply',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  expect(ui.body()).toContain('No event documents imported');expect(ui.body()).toContain('Unavailable');
  ui.click('Preview synthetic demo events');expect(ui.body()).toContain('Demo data: every event');expect(ui.draft().documents).toHaveLength(0);
  ui.click('Add preview to draft');expect(ui.draft().documents[0].provenance.fixture).toBe(true);expect(ui.props.onChange).not.toHaveBeenCalled();
  expect(ui.body()).toContain(' SYNTHETIC');
  ui.click('Apply');expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.onChange.mock.calls[0][0].documents[0].id).toBe('lv-synthetic-calendar-demo');expect(ui.props.onClose).toHaveBeenCalledOnce();
 });
 it('AUDIT7-FIX #8: loads and saves the labelled demo in one step from the empty state and stays open',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  ui.click('Load synthetic demo events');
  expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.onChange.mock.calls[0][0].documents[0].id).toBe('lv-synthetic-calendar-demo');expect(ui.props.onClose).not.toHaveBeenCalled();
  expect(ui.draft().documents[0].provenance.fixture).toBe(true);expect(ui.body()).toContain(' SYNTHETIC');expect(ui.body()).toContain('Synthetic demo events loaded and saved.');
  expect(ui.button('Revert to saved').props.disabled).toBe(true);
 });
 it('AUDIT7-FIX #8: a refused save leaves the calendar empty and says so',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(()=>false),onClose:vi.fn(),now:NOW});
  ui.click('Load synthetic demo events');expect(ui.draft().documents).toHaveLength(0);expect(ui.alert()).toContain('Workspace update was rejected');
 });
 it('opens at the entry-point family and switches tabs with the matching columns and keyboard arrows',()=>{
  const ui=mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW,initialKind:'dividend'});
  expect(ui.tab('Dividends').props['aria-selected']).toBe(true);expect(ui.headers()).toEqual(expect.arrayContaining(['Amount','Ex-date','Pay date','Yield']));
  expect(ui.body()).toContain('SYNTH1 cash dividend');expect(ui.body()).not.toContain('policy rate decision');
  ui.tab('IPO').props.onClick();expect(ui.draft().query.kind).toBe('ipo');expect(ui.headers()).toEqual(expect.arrayContaining(['Exchange','Offer price','Shares offered','Deal amount','Market cap']));
  expect(ui.body()).toContain('DEMO EXCHANGE');expect(ui.body()).toContain(' TENTATIVE');
  const preventDefault=vi.fn();ui.tab('IPO').props.onKeyDown({key:'ArrowRight',preventDefault,currentTarget:{parentElement:null}});expect(ui.draft().query.kind).toBe('split');expect(preventDefault).toHaveBeenCalled();
  ui.tab('Splits').props.onKeyDown({key:'Home',preventDefault,currentTarget:{parentElement:null}});expect(ui.draft().query.kind).toBe('economic');
  ui.tab('Economic').props.onKeyDown({key:'ArrowLeft',preventDefault,currentTarget:{parentElement:null}});expect(ui.draft().query.kind).toBe('all');
  ui.tab('All').props.onKeyDown({key:'Enter',preventDefault:vi.fn(),currentTarget:{parentElement:null}});expect(ui.draft().query.kind).toBe('all');
  expect(ui.props.onChange).not.toHaveBeenCalled();
 });
 it('applies period, timezone, country, importance and sort controls, moves periods, and distinguishes empty from unavailable',()=>{
  const ui=mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW,initialKind:'economic'});
  ui.change('Calendar period','today');expect(ui.body()).toContain('consumer price index');expect(ui.body()).not.toContain('policy rate decision');
  ui.click('Later period');expect(ui.draft().query).toMatchObject({period:'custom',from:'2026-06-11',to:'2026-06-11'});expect(ui.body()).toContain('policy rate decision');
  ui.click('Earlier period');ui.click('Earlier period');expect(ui.draft().query).toMatchObject({from:'2026-06-09',to:'2026-06-09'});expect(ui.body()).toContain('payroll survey');
  ui.change('Calendar timezone','America/New_York');expect(ui.body()).toContain('08:30:00 UTC-4');
  ui.field('Calendar countries').props.onChange({currentTarget:{selectedOptions:[{value:'XB'}]}});expect(ui.draft().query.countries).toEqual(['XB']);
  expect(ui.body()).toContain('Empty: no imported economic events match');
  ui.click('Reset filters');expect(ui.draft().query).toMatchObject({kind:'economic',timezone:'America/New_York',period:'all',countries:[]});
  ui.check('Calendar high importance only',true);const titles=ui.body();expect(titles).toContain('consumer price index');expect(titles).not.toContain('market holiday notice');
  const header=find(ui.render(),node=>node.type==='button'&&text(node.props.children).startsWith('Importance'));header.props.onClick();expect(ui.draft().query.sort).toEqual({key:'importance',direction:'asc'});
  find(ui.render(),node=>node.type==='button'&&text(node.props.children).startsWith('Importance')).props.onClick();expect(ui.draft().query.sort.direction).toBe('desc');
  expect(find(ui.render(),node=>node.type==='th'&&node.props['aria-sort']==='descending')).toBeTruthy();
  ui.change('Calendar period','custom');ui.change('Calendar from date','2030-01-01');ui.change('Calendar through date','2030-01-31');expect(ui.body()).toContain('Unavailable for this period');
  ui.change('Calendar timezone','Mars/Olympus');expect(ui.alert()).toContain('Invalid calendar query');ui.click('Apply');expect(ui.props.onChange).not.toHaveBeenCalled();
 });
 it('shows revision history with previous and revised values, the revised prior, and local iCalendar text',()=>{
  const ui=mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW+3600,initialKind:'economic',onSelectSymbol:vi.fn()});
  expect(ui.body()).toContain('2.7 % (revised from 2.6 %)');expect(ui.body()).toContain(' REVISED');
  ui.click('Synthetic demo: consumer price index (invented)');const details=text(find(ui.render(),node=>node.props['aria-label']==='Calendar event details'));
  expect(details).toContain('Revision history');expect(details).toContain('Showing r2; compared with r1');
  const changes=all(find(ui.render(),node=>node.props['aria-label']==='Calendar revision changes'),node=>node.type==='tr').map(row=>text(row.props.children));
  expect(changes).toEqual(expect.arrayContaining(['Prior2.6 %2.7 %','Prior as first reportedNot supplied or not available2.6 %']));
  expect(details).toContain('Launch chart is unavailable');expect(details).toContain('See overview is unavailable');
  ui.click('Add to calendar (iCalendar text)');const ics=ui.field('Calendar event iCalendar text').props.value as string;
  expect(ics).toContain('BEGIN:VEVENT');expect(ics).toContain('SUMMARY:SYNTHETIC: Synthetic demo: consumer price index (invented)');expect(ics).not.toContain('2.7');
  ui.click('Save iCalendar text file');expect(ui.alert()).toContain('desktop app');
 });
 it('routes symbol chart and financials actions through the host and keeps the dialog open on rejection',()=>{
  const onSelectSymbol=vi.fn(()=>false),onOpenFinancials=vi.fn(),ui=mount({state:withDemo(),onChange:vi.fn(),onClose:vi.fn(),now:NOW,initialKind:'dividend',onSelectSymbol,onOpenFinancials});
  ui.click('Synthetic demo: SYNTH1 cash dividend (invented)');ui.click('Open SYNTH1');expect(onSelectSymbol).toHaveBeenCalledWith(null,'SYNTH1');expect(ui.alert()).toContain('rejected');expect(ui.props.onClose).not.toHaveBeenCalled();
  ui.click('Open SYNTH1 financials');expect(onOpenFinancials).toHaveBeenCalledWith(null,'SYNTH1');expect(ui.props.onClose).toHaveBeenCalledOnce();
 });
 it('cancels, closes by Escape route and reverts without saving, and persists the full draft on Apply',()=>{
  const saved=withDemo(),ui=mount({state:saved,onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  expect(ui.button('Revert to saved').props.disabled).toBe(true);
  ui.change('Calendar search','');expect(ui.button('Revert to saved').props.disabled).toBe(true);
  ui.change('Calendar search','payroll');ui.tab('Economic').props.onClick();expect(ui.button('Revert to saved').props.disabled).toBe(false);
  ui.click('Revert to saved');expect(ui.draft().query).toEqual(saved.query);expect(ui.button('Revert to saved').props.disabled).toBe(true);
  ui.change('Calendar search','payroll');ui.click('Cancel');expect(ui.props.onClose).toHaveBeenCalledOnce();expect(ui.props.onChange).not.toHaveBeenCalled();
  // Escape and the header close button both call the Modal onClose, which is the same discard path.
  hooks.cells=[];const escape=mount({state:saved,onChange:vi.fn(),onClose:vi.fn(),now:NOW});escape.change('Calendar search','payroll');(escape.render() as any).props.onClose();expect(escape.props.onClose).toHaveBeenCalledOnce();expect(escape.props.onChange).not.toHaveBeenCalled();
  hooks.cells=[];const entry=mount({state:saved,onChange:vi.fn(),onClose:vi.fn(),now:NOW,initialKind:'ipo'});expect(entry.button('Revert to saved').props.disabled).toBe(false);entry.click('Revert to saved');expect(entry.draft().query.kind).toBe('all');expect(entry.button('Revert to saved').props.disabled).toBe(true);
  hooks.cells=[];const apply=mount({state:saved,onChange:vi.fn(),onClose:vi.fn(),now:NOW});apply.tab('IPO').props.onClick();apply.change('Calendar timezone','Asia/Kathmandu');apply.change('Calendar period','this-week');apply.click('Apply');
  const persisted=apply.props.onChange.mock.calls[0][0] as CalendarState;expect(persisted.query).toMatchObject({kind:'ipo',timezone:'Asia/Kathmandu',period:'this-week'});
  hooks.cells=[];const reopened=mount({state:JSON.parse(JSON.stringify(persisted)),onChange:vi.fn(),onClose:vi.fn(),now:NOW});expect(reopened.tab('IPO').props['aria-selected']).toBe(true);expect(reopened.field('Calendar timezone').props.value).toBe('Asia/Kathmandu');expect(reopened.field('Calendar period').props.value).toBe('this-week');
 });
 it('inserts templates that create no events and labels imported CSV as local',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  ui.click('Insert empty JSON document template');expect(ui.field('Calendar import text').props.value).toContain('"events": []');ui.click('Preview import');expect(ui.body()).toContain('1 document(s), 0 revisions');
  ui.click('Insert CSV header template');expect(ui.field('Calendar import format').props.value).toBe('csv');ui.click('Preview import');expect(ui.alert()).toContain('no events');
  ui.change('Calendar import text','id,kind,title,date,exchange\nx,ipo,My listing,2026-06-12,VENUE');ui.click('Preview import');ui.click('Add preview to draft');
  expect(ui.draft().documents[0].provenance).toMatchObject({kind:'local-import',fixture:false});const parsed=parseCalendarJson(JSON.stringify(ui.draft().documents[0]));expect(parsed.document!.events[0].exchange).toBe('VENUE');
 });
});

describe('second review dialog fixes (handlers only, not GUI evidence)',()=>{
 it('hides later-publication counts in the status, coverage and document lines under a historical cutoff',()=>{
  const d=parseCalendarJson(JSON.stringify([{id:'e',kind:'economic',title:'Synthetic known',date:'2026-06-01',publishedAt:100},{id:'e',kind:'economic',title:'Synthetic known',date:'2026-06-02',revision:2,publishedAt:NOW-10},{id:'i',kind:'ipo',title:'Synthetic later IPO',date:'2026-06-02',publishedAt:NOW-10}]),{documentId:'x',fixture:true,now:1}).document!;
  const ui=mount({state:{...createCalendarState(),documents:[d],query:{...createCalendarState().query,asOf:500}},onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  const body=ui.body();expect(body).toContain('1 event identities known by the cutoff');expect(body).toContain('revision count hidden under a historical cutoff');expect(body).not.toContain('3 revisions');expect(body).not.toContain('2 supplied event identities');expect(body).not.toContain('later IPO');
  ui.tab('IPO').props.onClick();expect(ui.body()).toContain('No imported IPO events are known by this cutoff.');expect(ui.body()).toContain('Unavailable at this cutoff');
 });
 it('offers Include cancelled events for a cancelled-only tab and keeps the cutoff on Reset filters with a status note',()=>{
  const d=parseCalendarJson(JSON.stringify([{id:'c',kind:'economic',title:'Synthetic cancelled',date:'2026-06-10',status:'cancelled',publishedAt:1}]),{documentId:'x',fixture:true,now:1}).document!;
  const ui=mount({state:{...createCalendarState(),documents:[d]},onChange:vi.fn(),onClose:vi.fn(),now:NOW,initialKind:'economic'});
  expect(ui.body()).toContain('Turn on Include cancelled events');ui.click('Include cancelled events');expect(ui.draft().query.includeCancelled).toBe(true);expect(ui.body()).toContain('Synthetic cancelled');
  ui.change('Calendar availability cutoff','5');ui.click('Reset filters');expect(ui.draft().query).toMatchObject({asOf:5,includeCancelled:false,kind:'economic'});expect(ui.body()).toContain('information cutoff (Unix second 5)');
  const sortOptions=all(ui.field('Calendar sort field'),node=>node.type==='option').map(node=>text(node.props.children));expect(sortOptions).toEqual(['Date and time','Country','Importance','Event','Actual','Forecast','Prior']);
 });
});
