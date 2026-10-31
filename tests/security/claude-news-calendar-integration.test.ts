import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {calendarEventToIcs,createCalendarState,queryCalendar,restoreCalendarDocument} from '../../src/domain/calendar';
import {emptyNewsQuery,parseNews,queryNews,type NewsDocument,type NewsItem} from '../../src/analysis-news/news';
import {NEWS_DISPLAY_CACHE_BUDGET,NEWS_DISPLAY_CACHE_MAX_ENTRIES,newsContentCacheDiagnostics,newsDisplayCacheStats,newsItemDisplay,newsMatchesSearch,newsSearchText,retainNewsDisplayCache} from '../../src/analysis-news/news-content';

// Invented fixtures only. No files, provider requests, timers, large archived data or GC assumptions.
const at='2024-01-01T00:00:00.000Z';
const item=(title:string,summary='',id=title):NewsItem=>({id,title,summary,provider:'P',publishedAt:at,sourceUrl:null,instruments:null,markets:null,sectors:null,corporateActivity:null,economics:null,countries:null,formats:null});
const documentOf=(items:NewsItem[],id='synthetic-news'):NewsDocument=>({schemaVersion:1,id,label:'Synthetic integration inputs',kind:'synthetic',importedAt:at,items});
beforeEach(()=>retainNewsDisplayCache([]));
afterEach(()=>retainNewsDisplayCache([]));

describe('calendar export identity',()=>{
 const row=(documentId:string,eventId:string,revision=1)=>queryCalendar([restoreCalendarDocument({schemaVersion:1,id:documentId,provenance:{kind:'synthetic',label:'Synthetic identity fixture',sourceUrl:null,importedAt:1,license:'Invented test data',fixture:true},events:[{id:eventId,revision,kind:'economic',title:'Synthetic event',date:'2024-01-01',publishedAt:1}]})],createCalendarState().query,1700000000).rows[0];
 const unfolded=(text:string)=>text.replace(/\r\n[ \t]/g,'');
 const uid=(text:string)=>unfolded(text).split('\r\n').find(line=>line.startsWith('UID:'));
 it('separates permitted IDs that previously collided at a hyphen separator',()=>{
  expect(uid(calendarEventToIcs(row('a-b','c'),1700000000))).toBe('UID:lv-%5B%22a-b%22%2C%22c%22%5D@opencandle.local');
  expect(uid(calendarEventToIcs(row('a','b-c'),1700000000))).toBe('UID:lv-%5B%22a%22%2C%22b-c%22%5D@opencandle.local');
 });
 it('keeps the event identity stable across revisions and changes only sequence',()=>{
  const first=calendarEventToIcs(row('same','event',1),1700000000),next=calendarEventToIcs(row('same','event',2),1700000001);
  expect(uid(next)).toBe(uid(first));expect(first).toContain('SEQUENCE:0\r\n');expect(next).toContain('SEQUENCE:1\r\n');
 });
 it('encodes Unicode, percent, newlines and lone surrogates without a new ICS property',()=>{
  const pairs=[['source%','a\nb'],['source','\u96ea'],['source','\ud800'],['source','%5B']];
  const values=pairs.map(([doc,id])=>uid(calendarEventToIcs(row(doc,id),1700000000))!);
  expect(new Set(values).size).toBe(4);
  expect(values[0]).toBe('UID:lv-%5B%22source%25%22%2C%22a%5Cnb%22%5D@opencandle.local');
  expect(values[1]).toContain('%E9%9B%AA');expect(values[2]).toContain('%5Cud800');
  expect(values.every(value=>!/[\r\n]/.test(value))).toBe(true);
 });
 it('folds long tuple identities within 75 octets and preserves their decoded pair',()=>{
  const doc='d'.repeat(150),id='e'.repeat(150),text=calendarEventToIcs(row(doc,id),1700000000);
  for(const line of text.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  const encoded=uid(text)!.slice('UID:lv-'.length,-'@opencandle.local'.length);
  expect(JSON.parse(decodeURIComponent(encoded))).toEqual([doc,id]);
 });
});

describe('bounded retained news content',()=>{
 it('charges raw title, raw summary and search text, including keys removed from live documents',()=>{
  // T = 1 character; <b>B</b> = 8; lower-case searchable "t b" = 3. Total 12.
  expect(newsItemDisplay(item('T','<b>B</b>')).body).toBe('B');
  expect(newsDisplayCacheStats()).toEqual({entries:1,cost:12});
  // No retain call accompanies this distinct workspace input. Both raw key sets remain charged.
  expect(newsItemDisplay(item('U','<b>B</b>')).body).toBe('B');
  expect(newsDisplayCacheStats()).toEqual({entries:2,cost:24});
  expect(retainNewsDisplayCache([])).toBe(2);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
 });
 it('does not strongly retain extracted link records or expanded display bodies in the content pool',()=>{
  // Raw anchor = 34 characters, title T = 1, search "t x" = 3. The address is not searchable.
  const source=item('T','<a href="https://x.example/">X</a>');
  expect(newsSearchText(source)).toBe('t x p ');
  expect(newsDisplayCacheStats()).toEqual({entries:1,cost:38});
  const display=newsItemDisplay(source);
  expect(display.links).toEqual([{text:'X',status:'external',href:'https://x.example/',host:'x.example',reason:'External web address shown as text only.'}]);
  expect(newsDisplayCacheStats()).toEqual({entries:1,cost:38});
  expect(newsItemDisplay({...source})).toBe(display);
  // No forced GC: this pins behavior and strong-text accounting, not a heap-reclamation result.
 });
 it('enforces the character budget even when every entry shares one summary group',()=>{
  // One shared 32,000-character source string; search output is a short title. This exercises the
  // budget without allocating a 64 MB fixture or thousands of distinct large summaries.
  const summary='<!--'+'x'.repeat(31993)+'-->',first=item('first',summary),start=newsContentCacheDiagnostics();
  newsMatchesSearch(first,'absent');
  for(let index=0;index<2100;index++)newsMatchesSearch(item('title'+index,summary),'absent');
  const full=newsDisplayCacheStats();expect(full.cost).toBeLessThanOrEqual(NEWS_DISPLAY_CACHE_BUDGET);expect(full.entries).toBeLessThan(2101);expect(full.entries).toBeGreaterThan(1000);
  expect(newsContentCacheDiagnostics().rejectedAdmissions).toBeGreaterThan(start.rejectedAdmissions);
  const before=newsContentCacheDiagnostics();newsMatchesSearch({...first},'still absent');
  expect(newsContentCacheDiagnostics().searchConversions).toBe(before.searchConversions);
  expect(newsContentCacheDiagnostics().contentHits).toBe(before.contentHits+1);
 },20000);
 it('caps entry bookkeeping for many tiny headline keys and does not evict the admitted warm set',()=>{
  const first=item('first');newsMatchesSearch(first,'absent');
  for(let index=0;index<NEWS_DISPLAY_CACHE_MAX_ENTRIES;index++)newsMatchesSearch(item('n'+index),'absent');
  expect(newsDisplayCacheStats().entries).toBe(20000);
  const before=newsContentCacheDiagnostics();newsMatchesSearch({...first},'another absent term');
  expect(newsContentCacheDiagnostics().searchConversions).toBe(before.searchConversions);
  expect(newsContentCacheDiagnostics().contentHits).toBe(before.contentHits+1);
 });
 it('prunes only missing title-summary pairs and frees their fully charged raw keys',()=>{
  const kept=item('T','<b>B</b>'),removed=item('U','<b>B</b>');newsItemDisplay(kept);newsItemDisplay(removed);
  expect(retainNewsDisplayCache([documentOf([kept])])).toBe(1);expect(newsDisplayCacheStats()).toEqual({entries:1,cost:12});
  const before=newsContentCacheDiagnostics();expect(newsMatchesSearch({...removed},'u b')).toBe(true);
  expect(newsContentCacheDiagnostics().searchConversions).toBe(before.searchConversions+1);
 });
 it('prunes replaced query documents without mutating either workspace or starving the new cache',()=>{
  const old=documentOf([item('T','<b>B</b>')],'old'),next=documentOf([item('U','<i>C</i>')],'new');
  const original=JSON.stringify([old,next]),query={...emptyNewsQuery(),search:'b'};
  expect(queryNews([old],query,[]).rows.map(row=>row.title)).toEqual(['T']);expect(newsDisplayCacheStats()).toEqual({entries:1,cost:12});
  expect(()=>queryNews([next],{...query,from:'2025-01-01',to:'2024-01-01'},[])).toThrow();expect(newsDisplayCacheStats()).toEqual({entries:1,cost:12});
  expect(queryNews([next],{...query,search:'c'},[]).rows.map(row=>row.title)).toEqual(['U']);expect(newsDisplayCacheStats()).toEqual({entries:1,cost:12});
  const warmed=newsContentCacheDiagnostics();queryNews([{...next,items:next.items.map(row=>({...row}))}],{...query,search:'u'},[]);
  expect(newsContentCacheDiagnostics().searchConversions).toBe(warmed.searchConversions);
  expect(JSON.stringify([old,next])).toBe(original);
  queryNews([],query,[]);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
 });
});

describe('search does not generate image-expanded display content',()=>{
 it('keeps alt text and literal supplied placeholder prose searchable, with no hidden URL or markup',()=>{
  const source=item('<b>Title</b>','<script>hidden words</script><p>Start<img alt="Chart &amp; table" src="https://hidden.example">End <a href="javascript:bad">Link</a> [image omitted: literal]</p>');
  const before=newsContentCacheDiagnostics();
  expect(newsSearchText(source)).toBe('title startchart & tableend link [image omitted: literal] p ');
  expect(newsMatchesSearch(source,'hidden')).toBe(false);expect(newsMatchesSearch(source,'javascript')).toBe(false);
  expect(newsContentCacheDiagnostics().displayConversions).toBe(before.displayConversions);
  const display=newsItemDisplay(source);expect(display.images).toBe(1);expect(display.links[0].status).toBe('blocked');
  expect(display.body).toContain('[image omitted: Chart & table]');
 });
 it('reuses normalized image-heavy search inputs without building or reparsing expanded displays',()=>{
  const raw={schemaVersion:1,label:'Synthetic image expansion',kind:'synthetic',items:Array.from({length:24},(_,index)=>({id:'i'+index,title:'Story '+index,summary:'<img>'.repeat(600)+' marker'+index,provider:'P',publishedAt:at}))};
  const copy=()=>parseNews(raw,'images',at),query={...emptyNewsQuery(),search:'marker23'};
  const before=newsContentCacheDiagnostics();expect(queryNews([copy()],query,[]).rows.map(row=>row.id)).toEqual(['i23']);
  const warmed=newsContentCacheDiagnostics();expect(warmed.searchConversions-before.searchConversions).toBe(24);expect(warmed.displayConversions).toBe(before.displayConversions);
  expect(queryNews([copy()],{...query,search:'image omitted'},[]).rows).toEqual([]);
  expect(newsContentCacheDiagnostics().searchConversions).toBe(warmed.searchConversions);expect(newsContentCacheDiagnostics().displayConversions).toBe(warmed.displayConversions);
  const source=copy().items[23],display=newsItemDisplay(source);expect(display.images).toBe(600);expect(display.body).toBe('[image omitted]'.repeat(600)+' marker23');
  // Strong cache accounting must stay unchanged when display-only placeholders are materialized.
  const cost=newsDisplayCacheStats().cost;expect(queryNews([copy()],query,[]).rows.map(row=>row.id)).toEqual(['i23']);expect(newsDisplayCacheStats().cost).toBe(cost);
 });
 it('keeps metadata scoped to the item rather than sharing it with title-summary cache hits',()=>{
  const a={...item('same','<p>body</p>'),provider:'Alpha',instruments:['GME']},b={...a,provider:'Beta',instruments:['SPY']};
  expect(newsMatchesSearch(a,'alpha')).toBe(true);expect(newsMatchesSearch(b,'alpha')).toBe(false);
  expect(newsMatchesSearch(b,'spy')).toBe(true);expect(newsMatchesSearch(b,'gme')).toBe(false);
 });
});
