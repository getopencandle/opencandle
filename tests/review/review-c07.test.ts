import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {ReactElement} from 'react';
import {CalendarDialog,resetCalendarFilters,serializeCalendarState} from '../../src/ui/CalendarDialog';
import {calendarCoverage,calendarEventToIcs,calendarRowsToCsv,calendarSelectorValues,createCalendarState,describeCalendarEmpty,parseCalendarCsv,queryCalendar,restoreCalendarDocument,restoreCalendarQuery,restoreCalendarState,shiftCalendarPeriod,type CalendarDocument,type CalendarQuery,type CalendarState} from '../../src/domain/calendar';

// Calendar second independent review (second reviewer). Expectations below were
// computed by hand from published DST rules (US: 2nd Sunday March / 1st Sunday
// November at 02:00 local; EU: last Sunday March / October at 01:00 UTC), not
// taken from the implementation. Tests named "L1".."L4 fixed" assert the
// behavior after the builder's second-review fixes; "NIT" characterizes an
// accepted residual.

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?[value.props.children,value.props.value,value.props.placeholder].map(text).join(''):'';
function all(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>[]{const found:ReactElement<any>[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found.push(node);visit(node.props.children);};visit(tree);return found;}
function find(tree:any,match:(node:ReactElement<any>)=>boolean){const found=all(tree,match)[0];if(!found)throw Error('target missing');return found;}
function mount(props:any){
 const render=()=>{hooks.cursor=0;return CalendarDialog(props) as any;};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node.props.children)===label);
 const field=(label:string)=>find(render(),node=>node.props['aria-label']===label);
 return {props,render,button,field,click:(label:string)=>button(label).props.onClick(),change:(label:string,value:string)=>field(label).props.onChange({target:{value}}),body:()=>text(render()),alert:()=>text(find(render(),node=>node.props.role==='alert')),draft:()=>hooks.cells[1] as CalendarState};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

const iso=(value:string)=>Date.parse(value)/1000;
function doc(events:unknown[],id='review-doc',fixture=false):CalendarDocument{return restoreCalendarDocument({schemaVersion:1,id,provenance:{kind:fixture?'synthetic':'local-import',label:'Review source',sourceUrl:null,importedAt:1,license:'review only',fixture},events});}
const q=(over:Partial<CalendarQuery>={}):CalendarQuery=>({...createCalendarState().query,...over});
const exact=(id:string,instant:string,timezone:string,date:string,extra:Record<string,unknown>={})=>({id,kind:'economic',title:id,date,time:instant,timezone,timing:'exact',publishedAt:1,...extra});
const NOW=iso('2026-12-31T12:00:00Z');

describe('DST transitions with independently computed wall times',()=>{
 it('US spring forward 2026-03-08: 01:30 EST then 03:30 EDT; a non-existent 02:30-05:00 wall time normalizes to 03:30 EDT',()=>{
  const d=doc([exact('a','2026-03-08T01:30:00-05:00','America/New_York','2026-03-08'),exact('b','2026-03-08T03:30:00-04:00','America/New_York','2026-03-08'),exact('c','2026-03-08T02:30:00-05:00','America/New_York','2026-03-08')]);
  const rows=queryCalendar([d],q({timezone:'America/New_York'}),NOW).rows.map(row=>[row.event.id,row.displayDate,row.displayTime,row.displayOffset]);
  expect(rows).toEqual([['a','2026-03-08','01:30:00','GMT-5'],['b','2026-03-08','03:30:00','GMT-4'],['c','2026-03-08','03:30:00','GMT-4']]);
  expect(d.events.find(e=>e.id==='a')!.time).toBe(iso('2026-03-08T06:30:00Z'));
 });
 it('rejects offset-less local times such as 02:30 on a DST day instead of guessing',()=>{
  expect(()=>doc([exact('x','2026-03-08T02:30:00','America/New_York','2026-03-08')])).toThrow(/explicit Z\/offset/);
 });
 it('US fall back 2026-11-01: the repeated 01:30 keeps both offsets and sorts by instant in both directions',()=>{
  const d=doc([exact('second','2026-11-01T01:30:00-05:00','America/New_York','2026-11-01'),exact('first','2026-11-01T01:30:00-04:00','America/New_York','2026-11-01')]);
  const asc=queryCalendar([d],q({timezone:'America/New_York'}),NOW).rows,desc=queryCalendar([d],q({timezone:'America/New_York',sort:{key:'date',direction:'desc'}}),NOW).rows;
  expect(asc.map(row=>`${row.event.id} ${row.displayTime} ${row.displayOffset}`)).toEqual(['first 01:30:00 GMT-4','second 01:30:00 GMT-5']);
  expect(desc.map(row=>row.event.id)).toEqual(['second','first']);
 });
 it('EU spring 2026-03-29 and fall 2026-10-25 in Europe/Berlin',()=>{
  const d=doc([exact('s1','2026-03-29T00:30:00Z','UTC','2026-03-29'),exact('s2','2026-03-29T01:30:00Z','UTC','2026-03-29'),exact('f1','2026-10-25T00:30:00Z','UTC','2026-10-25'),exact('f2','2026-10-25T01:30:00Z','UTC','2026-10-25')]);
  const rows=queryCalendar([d],q({timezone:'Europe/Berlin'}),NOW).rows.map(row=>`${row.event.id} ${row.displayDate} ${row.displayTime} ${row.displayOffset}`);
  expect(rows).toEqual(['s1 2026-03-29 01:30:00 GMT+1','s2 2026-03-29 03:30:00 GMT+2','f1 2026-10-25 02:30:00 GMT+2','f2 2026-10-25 02:30:00 GMT+1']);
 });
});

describe('date-boundary bucketing across display timezones',()=>{
 const d=doc([exact('late','2026-03-10T23:30:00Z','UTC','2026-03-10')]);
 it('23:30 UTC is 2026-03-11 08:30 in Tokyo and 2026-03-10 16:30 PDT in Los Angeles',()=>{
  const tokyo=queryCalendar([d],q({timezone:'Asia/Tokyo'}),NOW).rows[0],la=queryCalendar([d],q({timezone:'America/Los_Angeles'}),NOW).rows[0];
  expect([tokyo.displayDate,tokyo.displayTime,tokyo.displayOffset]).toEqual(['2026-03-11','08:30:00','GMT+9']);
  expect([la.displayDate,la.displayTime,la.displayOffset]).toEqual(['2026-03-10','16:30:00','GMT-7']);
  const day=q({period:'custom',from:'2026-03-11',to:'2026-03-11'});
  expect(queryCalendar([d],{...day,timezone:'Asia/Tokyo'},NOW).rows).toHaveLength(1);
  expect(queryCalendar([d],{...day,timezone:'America/Los_Angeles'},NOW).rows).toHaveLength(0);
 });
 it('Yesterday is evaluated per display zone at the same clock',()=>{
  const now=iso('2026-03-11T08:00:00Z'); // Tokyo 17:00 on 03-11, LA 01:00 on 03-11
  expect(queryCalendar([d],q({period:'yesterday',timezone:'America/Los_Angeles'}),now).rows).toHaveLength(1);
  expect(queryCalendar([d],q({period:'yesterday',timezone:'Asia/Tokyo'}),now).rows).toHaveLength(0);
 });
 it('a UTC+14 source event shows two dates earlier in UTC-12, and empty-state widening still treats it as covered',()=>{
  const k=doc([exact('kiri','2026-03-10T00:30:00+14:00','Pacific/Kiritimati','2026-03-10')]);
  const row=queryCalendar([k],q({timezone:'Etc/GMT+12'}),NOW).rows[0];expect([row.displayDate,row.displayTime,row.displayOffset]).toEqual(['2026-03-08','22:30:00','GMT-12']);
  const inside=q({timezone:'Etc/GMT+12',period:'custom',from:'2026-03-08',to:'2026-03-08'});expect(queryCalendar([k],inside,NOW).rows).toHaveLength(1);
  const before=q({timezone:'Etc/GMT+12',period:'custom',from:'2026-03-07',to:'2026-03-07'});expect(describeCalendarEmpty([k],before,queryCalendar([k],before,NOW),'',NOW).reason).toBe('outside-coverage');
 });
});

describe('all-day and unknown-time events are never converted',()=>{
 const d=doc([{id:'d1',kind:'economic',title:'Date only',date:'2026-03-10',timing:'date-only',publishedAt:1},{id:'d2',kind:'earnings',title:'Before open',date:'2026-03-10',timing:'before-open',publishedAt:1},{id:'d3',kind:'earnings',title:'Unknown',date:'2026-03-10',timing:'unknown',publishedAt:1}]);
 it.each(['UTC','Asia/Tokyo','Pacific/Kiritimati','Etc/GMT+12','America/Los_Angeles'])('keeps 2026-03-10 with no time in %s, and in CSV and iCalendar',zone=>{
  const result=queryCalendar([d],q({timezone:zone}),NOW);
  for(const row of result.rows){expect(row.displayDate).toBe('2026-03-10');expect(row.displayTime).toBeNull();expect(row.displayOffset).toBeNull();
   const ics=calendarEventToIcs(row,NOW);expect(ics).toContain('DTSTART;VALUE=DATE:20260310\r\n');expect(ics).toContain('DTEND;VALUE=DATE:20260311\r\n');expect(ics).not.toMatch(/DTSTART:\d{8}T/);}
  expect(calendarRowsToCsv(result)).not.toMatch(/T00:00|00:00:00/);
  expect(queryCalendar([d],q({timezone:zone,period:'custom',from:'2026-03-10',to:'2026-03-10'}),NOW).rows).toHaveLength(3);
 });
 it('iCalendar DTEND crosses month, leap-day and year ends',()=>{
  const ends=(date:string)=>calendarEventToIcs(queryCalendar([doc([{id:'x',kind:'dividend',title:'x',date,publishedAt:1}])],q(),NOW).rows[0],NOW).match(/DTEND;VALUE=DATE:(\d+)/)![1];
  expect(ends('2024-02-28')).toBe('20240229');expect(ends('2024-02-29')).toBe('20240301');expect(ends('2023-02-28')).toBe('20230301');expect(ends('2026-12-31')).toBe('20270101');
 });
});

describe('period arithmetic and custom range validation',()=>{
 const shift=(over:Partial<CalendarQuery>,direction:-1|1,now=NOW)=>{const r=shiftCalendarPeriod(q(over),direction,now);return r&&[r.period,r.from,r.to];};
 it('moves bounded ranges by their own length across month ends and leap day',()=>{
  expect(shift({period:'custom',from:'2024-02-28',to:'2024-02-29'},1)).toEqual(['custom','2024-03-01','2024-03-02']);
  expect(shift({period:'custom',from:'2024-02-28',to:'2024-02-29'},-1)).toEqual(['custom','2024-02-26','2024-02-27']);
  expect(shift({period:'custom',from:'2024-03-01',to:'2024-03-31'},-1)).toEqual(['custom','2024-01-30','2024-02-29']);
  expect(shift({period:'custom',from:'2023-03-01',to:'2023-03-31'},-1)).toEqual(['custom','2023-01-29','2023-02-28']);
  expect(shift({period:'custom',from:'2024-01-31',to:'2024-01-31'},1)).toEqual(['custom','2024-02-01','2024-02-01']);
  expect(shift({period:'today'},1)).toEqual(['custom','2027-01-01','2027-01-01']);
 });
 it('This week starts Monday in the display zone and shifts by seven days',()=>{
  const sunday=iso('2026-03-01T20:00:00Z'); // Sunday in UTC, Monday 05:00 in Tokyo
  expect(shift({period:'this-week'},1,sunday)).toEqual(['custom','2026-03-02','2026-03-08']);
  expect(shift({period:'this-week',timezone:'Asia/Tokyo'},-1,sunday)).toEqual(['custom','2026-02-23','2026-03-01']);
 });
 it('refuses unbounded or out-of-range shifts',()=>{
  expect(shift({period:'all'},1)).toBeNull();expect(shift({period:'upcoming'},-1)).toBeNull();
  expect(shift({period:'custom',from:'9999-12-31',to:'9999-12-31'},1)).toBeNull();expect(shift({period:'custom',from:'0001-01-01',to:'0001-01-01'},-1)).toBeNull();
 });
 it('rejects reversed, half-open and impossible custom ranges; accepts leap day',()=>{
  expect(()=>restoreCalendarQuery(q({period:'custom',from:'2026-03-10',to:'2026-03-09'}))).toThrow(/ascending/);
  expect(()=>restoreCalendarQuery(q({period:'custom',from:'2026-03-10',to:null}))).toThrow();
  expect(()=>restoreCalendarQuery(q({period:'custom',from:'2026-02-29',to:'2026-03-01'}))).toThrow();
  expect(restoreCalendarQuery(q({period:'custom',from:'2024-02-29',to:'2024-02-29'})).from).toBe('2024-02-29');
 });
 it('the dialog blocks Apply on a reversed custom range and leaves the saved state untouched',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  ui.change('Calendar period','custom');expect(ui.draft().query).toMatchObject({from:'2026-12-31',to:'2026-12-31'});
  ui.change('Calendar from date','2027-01-05');expect(ui.alert()).toMatch(/ascending/);ui.click('Apply');expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
  expect(ui.button('Earlier period').props.disabled).toBe(true);
 });
 it('Use local timezone sets the resolved Intl zone',()=>{
  const ui=mount({state:createCalendarState(),onChange:vi.fn(),onClose:vi.fn(),now:NOW});ui.click('Use local timezone');
  expect(ui.draft().query.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
 });
});

describe('point-in-time cutoff: nothing published after the cutoff leaks',()=>{
 const C=iso('2026-03-05T00:00:00Z'),T1=C-86400,T2=C+86400;
 const d=doc([
  {id:'x',revision:1,kind:'economic',title:'Original title',date:'2026-03-10',country:'AA',category:'Inflation',publishedAt:T1,values:{actual:{value:777.5,unit:'%',availableAt:T2},forecast:{value:2,unit:'%',availableAt:T1}}},
  {id:'x',revision:2,kind:'economic',title:'Leaked title',description:'Leaked description',date:'2026-03-12',country:'ZZ',category:'LeakCat',symbol:'LEAK',publishedAt:T2,values:{actual:{value:888.25,unit:'%',availableAt:T2},forecast:{value:3,unit:'%',availableAt:T2}}},
  {id:'y',kind:'ipo',title:'Future IPO',date:'2026-04-20',country:'QQ',symbol:'FUTR',exchange:'SECRET VENUE',publishedAt:T2},
  {id:'z',kind:'economic',title:'Undated publication',date:'2026-03-09',country:'UU',publishedAt:null},
 ]);
 const query=q({asOf:C});
 const result=queryCalendar([d],query,NOW);
 const secrets=['Leaked','LeakCat','LEAK','ZZ','QQ','FUTR','SECRET VENUE','Future IPO','UU','Undated publication','777.5','888.25','2026-03-12','2026-04-20'];
 it('rows, revision history, CSV report and iCalendar text use only eligible data',()=>{
  expect(result.rows.map(row=>row.event.title)).toEqual(['Original title']);
  const row=result.rows[0];expect(row.values.actual).toMatchObject({value:null,state:'not-yet-available'});expect(row.revisions.history.map(h=>h.revision)).toEqual([1]);expect(row.revisions.changes).toEqual([]);
  const csv=calendarRowsToCsv(result),ics=calendarEventToIcs(row,NOW);
  for(const secret of secrets){expect(csv).not.toContain(secret);expect(ics).not.toContain(secret);}
 });
 it('coverage spans and selector options exclude later and undated publications',()=>{
  const cutoff={asOf:C,now:NOW},cov=calendarCoverage([d],'all',cutoff);
  expect([cov.identities,cov.from,cov.to]).toEqual([1,'2026-03-10','2026-03-10']);
  expect(calendarSelectorValues([d],'all','country',cutoff)).toEqual(['AA']);expect(calendarSelectorValues([d],'all','symbol',cutoff)).toEqual([]);expect(calendarSelectorValues([d],'all','category',cutoff)).toEqual(['Inflation']);
 });
 it('search and value sorts cannot reach later text or masked values',()=>{
  expect(queryCalendar([d],{...query,search:'Leaked'},NOW).rows).toHaveLength(0);
  const s=doc([{id:'a',kind:'economic',title:'a',date:'2026-03-02',publishedAt:T1,values:{actual:{value:100,unit:'%',availableAt:T2}}},{id:'b',kind:'economic',title:'b',date:'2026-03-01',publishedAt:T1,values:{actual:{value:5,unit:'%',availableAt:T1}}},{id:'c',kind:'economic',title:'c',date:'2026-03-03',publishedAt:T1,values:{actual:{value:50,unit:'%',availableAt:T1}}}]);
  expect(queryCalendar([s],q({asOf:C,sort:{key:'actual',direction:'desc'}}),NOW).rows.map(row=>row.event.id)).toEqual(['c','b','a']);
 });
 it('a revision history at an intermediate cutoff lists only revisions known then, oldest first, with masked diffs',()=>{
  const h=doc([{id:'r',revision:1,kind:'economic',title:'r1',date:'2026-03-10',publishedAt:T1-100,values:{prior:{value:1,unit:'%',availableAt:T1-100}}},{id:'r',revision:2,kind:'economic',title:'r2',date:'2026-03-10',publishedAt:T1,values:{prior:{value:2,unit:'%',availableAt:T2}}},{id:'r',revision:3,kind:'economic',title:'r3 later',date:'2026-03-10',publishedAt:T2,values:{prior:{value:3,unit:'%',availableAt:T2}}}]);
  const row=queryCalendar([h],q({asOf:C}),NOW).rows[0];
  expect(row.event.title).toBe('r2');expect(row.revisions.history.map(e=>e.revision)).toEqual([1,2]);expect(row.revisions.previousRevision).toBe(1);
  expect(row.revisions.changes).toEqual(expect.arrayContaining([{field:'title',before:'r1',after:'r2'},expect.objectContaining({field:'prior',before:1,after:null})]));
  expect(JSON.stringify(row)).not.toContain('r3 later');
 });
 it('the rendered dialog (rows, selectors, coverage line, details) shows none of the later text',()=>{
  const ui=mount({state:{...createCalendarState(),documents:[d],query},onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  ui.click('Original title');const body=ui.body();
  for(const secret of secrets)expect(body).not.toContain(secret);
 });
 it('L1 fixed: under a cutoff every tab looks identical with or without the later events (counts, empty messages, status, coverage, document list, selectors, CSV, iCalendar)',()=>{
  const early=doc(d.events.filter(event=>event.id==='x'&&event.revision===1));
  for(const kind of ['all','economic','earnings','dividend','ipo','split'] as const){
   const query2=q({asOf:C,kind}),cutoff={asOf:C,now:NOW};
   expect(calendarCoverage([d],kind,cutoff)).toEqual(calendarCoverage([early],kind,cutoff));expect(calendarCoverage([d],kind,cutoff).unavailableAtCutoff).toBe(0);
   for(const key of ['country','category','symbol'] as const)expect(calendarSelectorValues([d],kind,key,cutoff)).toEqual(calendarSelectorValues([early],kind,key,cutoff));
   const late=queryCalendar([d],query2,NOW),known=queryCalendar([early],query2,NOW);
   expect(describeCalendarEmpty([d],query2,late,'',NOW)).toEqual(describeCalendarEmpty([early],query2,known,'',NOW));
   expect(calendarRowsToCsv(late)).toBe(calendarRowsToCsv(known));
   late.rows.forEach((row,index)=>expect(calendarEventToIcs(row,NOW)).toBe(calendarEventToIcs(known.rows[index],NOW)));
   const bodies=[d,early].map(document=>{hooks.cells=[];const ui=mount({state:{...createCalendarState(),documents:[document],query:query2},onChange:vi.fn(),onClose:vi.fn(),now:NOW});if(known.rows.length)ui.click('Original title');return ui.body();});
   expect(bodies[0]).toBe(bodies[1]);for(const secret of secrets)expect(bodies[0]).not.toContain(secret);
  }
  expect(describeCalendarEmpty([d],q({asOf:C,kind:'ipo'}),queryCalendar([d],q({asOf:C,kind:'ipo'}),NOW),'',NOW).reason).toBe('cutoff');
  expect(describeCalendarEmpty([d],q({asOf:C,kind:'split'}),queryCalendar([d],q({asOf:C,kind:'split'}),NOW),'',NOW).reason).toBe('cutoff');
  // Accepted residual: the domain result still carries import metadata (used by src/watchlists/advanced.ts:102); the dialog does not render it under a cutoff (asserted above).
  expect(result.coverage.records).toBe(4);
 });
});

describe('empty versus unavailable per tab',()=>{
 const NOWX=iso('2026-03-10T12:00:00Z');
 const econ=doc([{id:'e',kind:'economic',title:'e',date:'2026-03-10',country:'AA',publishedAt:1}]);
 const reason=(docs:CalendarDocument[],over:Partial<CalendarQuery>)=>{const query=q(over),result=queryCalendar(docs,query,NOWX);return result.rows.length?'rows':`${describeCalendarEmpty(docs,query,result,'',NOWX).reason}/${describeCalendarEmpty(docs,query,result,'',NOWX).availability}`;};
 it('classifies each tab',()=>{
  expect(reason([],{kind:'economic'})).toBe('no-documents/unavailable');
  expect(reason([econ],{kind:'economic',period:'today'})).toBe('rows');
  for(const kind of ['earnings','dividend','ipo','split'] as const)expect(reason([econ],{kind})).toBe('no-kind-coverage/unavailable');
  expect(reason([econ],{kind:'all',countries:['BB']})).toBe('filtered/empty');
  expect(reason([econ],{kind:'economic',period:'custom',from:'2027-01-01',to:'2027-01-31'})).toBe('outside-coverage/unavailable');
  expect(reason([econ],{kind:'economic',period:'custom',from:'2026-03-12',to:'2026-03-12'})).toBe('filtered/empty'); // inside the +-2 day widening
  expect(describeCalendarEmpty([econ],q(),null,'boom',NOWX)).toMatchObject({reason:'error',availability:'unavailable'});
 });
 it('L2 fixed: a tab whose only events are cancelled offers Include cancelled events, which reveals them',()=>{
  const cancelled=doc([{id:'c',kind:'economic',title:'Cancelled auction',date:'2026-03-10',status:'cancelled',publishedAt:1}]);
  expect(reason([cancelled],{kind:'economic'})).toBe('cancelled/empty');
  expect(reason([cancelled],{kind:'economic',includeCancelled:true})).toBe('rows');
  const ui=mount({state:{...createCalendarState(),documents:[cancelled],query:q({kind:'economic'})},onChange:vi.fn(),onClose:vi.fn(),now:NOWX});
  expect(ui.body()).toContain('Include cancelled events to show them');expect(()=>ui.button('Reset filters')).not.toThrow(); // toolbar Reset remains; the empty-state offers Include cancelled
  const buttons=all(ui.render(),node=>node.type==='button'&&text(node.props.children)==='Include cancelled events');expect(buttons).toHaveLength(1);buttons[0].props.onClick();
  expect(ui.draft().query.includeCancelled).toBe(true);expect(ui.body()).toContain('Cancelled auction');expect(ui.body()).toContain(' CANCELLED');
 });
 it('L3 fixed: Reset filters keeps the historical information cutoff and says so',()=>{
  expect(resetCalendarFilters(q({asOf:12345,kind:'economic',countries:['AA']}))).toMatchObject({asOf:12345,kind:'economic',countries:[]});
  const ui=mount({state:{...createCalendarState(),documents:[econ],query:q({asOf:12345,search:'zzz'})},onChange:vi.fn(),onClose:vi.fn(),now:NOWX});
  all(ui.render(),node=>node.type==='button'&&text(node.props.children)==='Reset filters')[0].props.onClick();
  expect(ui.draft().query).toMatchObject({asOf:12345,search:''});expect(ui.body()).toContain('information cutoff (Unix second 12345)');
 });
});

describe('iCalendar text escaping, folding and locality',()=>{
 const row=(title:string,description='')=>queryCalendar([doc([{id:'i',kind:'economic',title,description,date:'2026-03-10',time:'2026-03-10T23:30:00Z',timezone:'UTC',timing:'exact',publishedAt:1,values:{actual:{value:123.456,unit:'%',availableAt:1}}}])],q(),NOW).rows[0];
 const unfold=(ics:string)=>ics.replace(/\r\n[ \t]/g,'');
 it('escapes backslash, comma, semicolon and newlines in TEXT values',()=>{
  const ics=unfold(calendarEventToIcs(row('Rates, decision; part\\two\nline','a\r\nb\rc'),NOW));
  expect(ics).toContain('SUMMARY:Rates\\, decision\\; part\\\\two\\nline\r\n');
  expect(ics).toMatch(/DESCRIPTION:[^\r\n]*\\na\\nb\\nc\\n/);
  expect(ics).toContain('DTSTART:20260310T233000Z\r\n');expect(ics).not.toContain('123.456');
 });
 it('folds at 75 octets, never splits a UTF-8 character, uses CRLF only and unfolds losslessly',()=>{
  for(const title of ['A'.repeat(300),'€'.repeat(90),'😀'.repeat(70),'x'+'é'.repeat(100)]){
   const ics=calendarEventToIcs(row(title),NOW);expect(ics.endsWith('\r\n')).toBe(true);expect(ics).not.toMatch(/(^|[^\r])\n/);
   const lines=ics.split('\r\n').slice(0,-1),encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
   for(const line of lines){const bytes=encoder.encode(line);expect(bytes.length).toBeLessThanOrEqual(75);expect(decoder.decode(bytes)).toBe(line);}
   expect(unfold(ics)).toContain(`SUMMARY:${title}\r\n`);
  }
 });
 it('L4 fixed: C0/C1 controls and DEL are removed from TEXT, HTAB kept, escaping and folding intact',()=>{
  const ics=calendarEventToIcs(row('bell\u0007here\u0000\u001b\u007f\u0085\u009f, tab\there; '+'€'.repeat(40),'d\u0001e\nf'),NOW);
  expect(ics).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/);
  const unfolded=unfold(ics);expect(unfolded).toContain(`SUMMARY:bellhere\\, tab\there\\; ${'€'.repeat(40)}\r\n`);expect(unfolded).toMatch(/DESCRIPTION:[^\r\n]*de\\nf\\n/);
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  for(const line of ics.split('\r\n').slice(0,-1)){const bytes=encoder.encode(line);expect(bytes.length).toBeLessThanOrEqual(75);expect(decoder.decode(bytes)).toBe(line);}
  expect(ics).not.toMatch(/(^|[^\r])\n/);
 });
 it('has no network primitive in the calendar domain or dialog; the dialog saves only through exportData',()=>{
  for(const file of ['src/domain/calendar.ts','src/ui/CalendarDialog.tsx']){const source=readFileSync(file,'utf8');expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|window\.open|location\.href/);}
 });
});

describe('import validation of malformed rows',()=>{
 const csv=(header:string,...rows:string[])=>parseCalendarCsv([header,...rows].join('\n'));
 it.each([
  ['wrong cell count',csv('id,kind,title,date','a,economic,t,2026-03-10,extra'),/row 2/],
  ['unknown header',csv('id,kind,title,date,foo','a,economic,t,2026-03-10,1'),/known headers/],
  ['duplicate header',csv('id,kind,title,date,date','a,economic,t,2026-03-10,2026-03-10'),/unique/],
  ['value without unit',csv('id,kind,title,date,actual','a,economic,t,2026-03-10,1.5'),/actual unit/],
  ['comma decimal',csv('id,kind,title,date,actual,actualUnit','a,economic,t,2026-03-10,"1,5",%'),/numeric actual/],
  ['hex number',csv('id,kind,title,date,actual,actualUnit','a,economic,t,2026-03-10,0x10,%'),/numeric actual/],
  ['overflow',csv('id,kind,title,date,actual,actualUnit','a,economic,t,2026-03-10,1e400,%'),/numeric actual/],
  ['fractional revision',csv('id,kind,title,date,revision','a,economic,t,2026-03-10,1.5'),/Revision/],
  ['time without zone',csv('id,kind,title,date,time','a,economic,t,2026-03-10,2026-03-10T12:00:00Z'),/match the supplied date/],
  ['offset-less local time',csv('id,kind,title,date,time,timezone','a,economic,t,2026-03-10,2026-03-10T12:00:00,UTC'),/explicit Z\/offset/],
  ['date not matching source zone',csv('id,kind,title,date,time,timezone','a,economic,t,2026-03-10,2026-03-10T23:30:00Z,Asia/Tokyo'),/match the supplied date/],
  ['date-only with a time',csv('id,kind,title,date,time,timezone,timing','a,economic,t,2026-03-10,2026-03-10T12:00:00Z,UTC,date-only'),/must not invent/],
  ['capitalized importance',csv('id,kind,title,date,importance','a,economic,t,2026-03-10,High'),/importance/],
  ['impossible date',csv('id,kind,title,date','a,economic,t,2026-02-29'),/calendar date/],
 ])('rejects %s and the whole import',(_name,result,message)=>{expect(result.ok).toBe(false);expect(result.document).toBeUndefined();expect(result.diagnostics.join(' ')).toMatch(message as RegExp);});
 it('one bad row rejects every row; empty cells stay missing and an explicit 0 stays 0',()=>{
  expect(csv('id,kind,title,date','a,economic,t,2026-03-10','b,bogus,t,2026-03-10').ok).toBe(false);
  const ok=csv('id,kind,title,date,actual,actualUnit,forecast,forecastUnit','a,economic,t,2026-03-10,,%,0,%');expect(ok.ok).toBe(true);
  expect(ok.document!.events[0].values.actual).toEqual({value:null,unit:'%',availableAt:null});expect(ok.document!.events[0].values.forecast!.value).toBe(0);
 });
 it('neutralizes spreadsheet formulas in the CSV report',()=>{
  const r=queryCalendar([doc([{id:'f',kind:'economic',title:'=HYPERLINK("x")',date:'2026-03-10',publishedAt:1}])],q(),NOW);
  expect(calendarRowsToCsv(r)).toContain(`"'=HYPERLINK(""x"")"`);
 });
});

describe('persistence round-trip and older saved states',()=>{
 it('round-trips a state with every OpenCandle-C07 field',()=>{
  const state:CalendarState={...createCalendarState(),documents:[doc([{id:'p',kind:'ipo',title:'p',date:'2026-03-10',exchange:'VENUE',publishedAt:1,values:{marketCap:{value:5,unit:'USD',availableAt:1},priorRevisedFrom:{value:1,unit:'%',availableAt:1}}}])],query:q({kind:'ipo',period:'custom',from:'2024-02-29',to:'2024-03-01',timezone:'Asia/Kathmandu',sort:{key:'exchange',direction:'desc'},asOf:100})};
  const restored=restoreCalendarState(JSON.parse(serializeCalendarState(state)));expect(restored).toEqual(restoreCalendarState(state));expect(restored.documents[0].events[0].exchange).toBe('VENUE');
 });
 it('restores a baseline-shaped saved state (no exchange field, legacy value keys and sort key) and opens it in the dialog',()=>{
  const old={schemaVersion:1,documents:[{schemaVersion:1,id:'old',provenance:{kind:'local-import',label:'Old',sourceUrl:null,importedAt:1,license:'x',fixture:false},events:[{id:'o',revision:1,kind:'dividend',title:'Old dividend',description:'',date:'2026-03-10',time:null,timezone:null,timing:'date-only',symbol:'OLD',instrumentId:null,country:null,category:null,importance:null,status:'scheduled',publishedAt:1,fiscalPeriod:null,exDate:'2026-03-10',payDate:null,values:{dividendAmount:{value:0.5,unit:'USD',availableAt:1}}}]}],query:{kind:'dividend',period:'all',from:null,to:null,timezone:'UTC',countries:[],categories:[],symbols:[],highImportance:false,search:'',includeCancelled:false,asOf:null,sort:{key:'splitRatio',direction:'asc'}}};
  const restored=restoreCalendarState(old);expect(restored.documents[0].events[0].exchange).toBeNull();
  const ui=mount({state:old,onChange:vi.fn(),onClose:vi.fn(),now:NOW});expect(ui.body()).toContain('Old dividend');ui.click('Apply');expect(ui.props.onChange.mock.calls[0][0].documents[0].events[0].exchange).toBeNull();
 });
});

describe('stale-closure decision',()=>{
 it('NIT: Earlier period replaces the whole query with one computed at render time (not a functional update)',()=>{
  const ui=mount({state:{...createCalendarState(),query:q({period:'today'})},onChange:vi.fn(),onClose:vi.fn(),now:NOW});
  const tree=ui.render(),tz=find(tree,node=>node.props['aria-label']==='Calendar timezone'),earlier=find(tree,node=>node.type==='button'&&text(node.props.children)==='Earlier period');
  tz.props.onChange({target:{value:'Asia/Tokyo'}});earlier.props.onClick();
  // Two handlers from one render: the queued timezone change is overwritten. React re-renders between discrete
  // user events, so this needs two handlers in one event to occur; it is reachable only programmatically.
  expect(ui.draft().query.timezone).toBe('UTC');
 });
});
