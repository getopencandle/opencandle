import {describe,it,expect} from 'vitest';
import {NEWS_DISPLAY_CACHE_BUDGET,classifyNewsLink,decodeEntities,htmlToInertText,looksLikeMarkup,newsDisplayCacheStats,newsItemDisplay,newsMatchesSearch,newsSearchText,retainNewsDisplayCache} from '../../src/analysis-news/news-content';
import {queryNews,emptyNewsQuery,type NewsItem} from '../../src/analysis-news/news';
import {parseNews} from '../../src/analysis-news/news';
// All inputs below are synthetic hostile fixtures written for this test; none is real news.
const t=(s:string)=>htmlToInertText(s).text;
describe('inert rendering of imported markup',()=>{
 it('drops executable, styling and embedded content including its text',()=>{
  expect(t('<script>alert(1)</script>Hello')).toBe('Hello');
  expect(t('<SCRIPT type="x">bad()</ScRiPt >Hi')).toBe('Hi');
  expect(t('<style>body{display:none}</style><p>Shown</p>')).toBe('Shown');
  expect(t('<iframe src="https://evil.example"></iframe>A<object data="x">B</object>C')).toBe('A C');
  expect(t('<svg><script>alert(1)</script><text>svgtext</text></svg>after')).toBe('after');
  expect(t('<template><img src=x onerror=alert(1)></template>T')).toBe('T');
  expect(t('<form action="https://evil.example"><input name=q><button>Go</button></form>Body')).toBe('Body');
 });
 it('strips event-handler attributes with their tags and keeps only visible text',()=>{
  expect(t('<div onclick="steal()" style="x">Text</div>')).toBe('Text');
  expect(t('<a title="x>y" href="https://ok.example/a">link text</a> end')).toBe('link text end');
  expect(t('<img src=x onerror=alert(1)>')).toBe('[image omitted]');
  expect(t('<img alt="Chart &amp; table" src="https://tracker.example/p.gif">')).toBe('[image omitted: Chart & table]');
  expect(htmlToInertText('<img src=a><img src=b>').images).toBe(2);
 });
 it('treats comments, doctype, processing instructions and malformed or unterminated markup safely',()=>{
  expect(t('<!-- <script>alert(1)</script> -->Visible')).toBe('Visible');
  expect(t('<!DOCTYPE html><?xml version="1.0"?>Doc')).toBe('Doc');
  expect(t('Before<script>alert(1)')).toBe('Before alert(1)');
  expect(t('Before<b class="unterminated')).toBe('Before<b class="unterminated');
  expect(t('<p>Unclosed <b>bold')).toBe('Unclosed bold');
  expect(t('<p>2 < 3 and 5 > 4</p>')).toBe('2 < 3 and 5 > 4');
 });
 it('decodes a fixed entity whitelist into text that stays inert, and rejects invalid code points',()=>{
  expect(t('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<script>alert(1)</script>');
  expect(decodeEntities('S&amp;P &#8212; &#x2014; &unknown; &#0; &#x110000; &#xD800;')).toBe('S&P \u2014 \u2014 &unknown; \ufffd \ufffd \ufffd');
 });
 it('keeps structure as line breaks and list bullets',()=>{expect(t('<h1>Title</h1><p>One<br>Two</p><ul><li>A</li><li>B</li></ul>')).toBe('Title\n\nOne\nTwo\n\n\u2022 A\n\u2022 B');});
 it('leaves plain text untouched, including literal angle brackets and entities',()=>{const item=parseNews({schemaVersion:1,label:'Synthetic plain',kind:'synthetic',items:[{id:'p',title:'AT&amp;T < 5% move',summary:'Line one\n  indented',provider:'Synthetic',publishedAt:'2024-01-01T00:00:00Z'}]},'d','2024-01-01T00:00:00Z').items[0];expect(looksLikeMarkup(item.title)).toBe(false);const d=newsItemDisplay(item);expect(d).toMatchObject({title:'AT&amp;T < 5% move',body:'Line one\n  indented',markup:false,links:[]});});
});
describe('imported link classification',()=>{
 it('blocks every non-web scheme, including obfuscated forms',()=>{
  for(const href of ['javascript:alert(1)','  JAVASCRIPT:alert(1)','java\tscript:alert(1)','java\nscript:alert(1)','&#106;avascript:alert(1)','&#x6A;avascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///C:/Windows/win.ini','vbscript:msgbox(1)','blob:https://x/1','about:blank','chrome://settings','ms-settings:privacy','lv://app/index.html','mailto:a@b.example']){const link=classifyNewsLink(href,'x');expect(link.status,href).toBe('blocked');expect(link.href,href).toBeNull();}
  expect(classifyNewsLink('javascript:alert(1)').reason).toBe('Blocked javascript: link scheme.');
 });
 it('blocks credentials and bidirectional spoofing; relative links have no trusted base',()=>{
  expect(classifyNewsLink('https://user:pw@example.com/').status).toBe('blocked');
  expect(classifyNewsLink('https://example.com/\u202Egpj.exe').status).toBe('blocked');
  expect(classifyNewsLink('//evil.example/x')).toMatchObject({status:'unresolved',href:null});
  expect(classifyNewsLink('/relative/path')).toMatchObject({status:'unresolved',href:null});
  expect(classifyNewsLink('')).toMatchObject({status:'unresolved',href:null});
 });
 it('shows only normalized credential-free http(s) addresses, as text',()=>{expect(classifyNewsLink(' https://Example.COM/a?b=1 ','Read')).toEqual({text:'Read',status:'external',href:'https://example.com/a?b=1',host:'example.com',reason:'External web address shown as text only.'});});
 it('extracts anchors from markup without making them navigable',()=>{const r=htmlToInertText('<p>See <a href="javascript:alert(1)">bad</a> and <a href=\'https://ok.example/x\'>good</a> and <a name="anchor">no href</a></p>');expect(r.text).toBe('See bad and good and no href');expect(r.links.map(l=>[l.text,l.status,l.href])).toEqual([['bad','blocked',null],['good','external','https://ok.example/x']]);});
});
describe('review regressions',()=>{
 it('stays linear on long hostile whitespace runs inside link targets and text (ReDoS)',()=>{
  const spaces=' '.repeat(31000),started=performance.now();
  expect(htmlToInertText('<a href="https://x/'+spaces+'y">t</a>').links).toEqual([]); // a tag longer than 8,192 characters is literal text
  expect(htmlToInertText('<a href="https://x/'+' '.repeat(5000)+'y">t</a>').links[0].status).toBe('blocked');
  expect(classifyNewsLink('https://x/'+' '.repeat(4000)+'y').status).toBe('blocked');
  expect(classifyNewsLink('x'.repeat(5000)).reason).toBe('Link target exceeds 4,096 characters.');
  htmlToInertText('<p>'+' \t'.repeat(15000)+'x</p>');htmlToInertText('<script>'+'</scriptx'.repeat(3000));htmlToInertText('&amp;'.repeat(6000));
  expect(performance.now()-started).toBeLessThan(500);
 });
 it('case folding never shifts indexes, so text after dropped content survives non-ASCII input',()=>{expect(t('İ'.repeat(10)+'<script>x</script>VISIBLE')).toBe('İ'.repeat(10)+' VISIBLE');expect(t('<SCRİPT>x</SCRİPT>y')).toBe('<SCRİPT>x</SCRİPT>y');});
 it('strips bidirectional controls from link labels',()=>{expect(classifyNewsLink('https://ok.example/','safe‮exe.txt⁦').text).toBe('safeexe.txt');});
 it('display cache stays warm for re-normalized items with identical content',()=>{const raw={schemaVersion:1,label:'Synthetic cache',kind:'synthetic',items:[{id:'c',title:'<b>Cached</b>',summary:'<p>body</p>',provider:'P',publishedAt:'2024-01-01T00:00:00Z'}]};const one=parseNews(raw,'d','2024-01-01T00:00:00Z').items[0],two=parseNews(raw,'d','2024-01-01T00:00:00Z').items[0];expect(one).not.toBe(two);expect(newsItemDisplay(two)).toBe(newsItemDisplay(one));});
});
describe('second review regressions',()=>{
 const item=(summary:string,title='Synthetic stress'):NewsItem=>({id:'x',title,summary,provider:'P',publishedAt:'2024-01-01T00:00:00.000Z',sourceUrl:null,instruments:null,markets:null,sectors:null,corporateActivity:null,economics:null,countries:null,formats:null});
 it('R1: placeholder-shaped text stays linear at 1 MiB (display and search)',()=>{
  const mib='<p>'+'[image omitted: '.repeat(65536),started=performance.now();
  const big=item(mib);expect(newsItemDisplay(big).body.startsWith('[image omitted: [image omitted:')).toBe(true);expect(newsMatchesSearch(big,'zzz')).toBe(false);
  htmlToInertText('<img alt="'+'x'.repeat(200)+'">'+'[image omitted: '.repeat(65536));
  expect(performance.now()-started).toBeLessThan(2000);
 });
 it('R1: twenty parse-sized placeholder items search well under the review bound',()=>{const chunk='<p>'+'[image omitted: '.repeat(1999);const docs=[{id:'s',schemaVersion:1 as const,label:'Synthetic stress',importedAt:'2024-01-01T00:00:00.000Z',kind:'synthetic' as const,items:Array.from({length:20},(_,i)=>({...item(chunk+i,'Stress '+i),id:'s'+i}))}];const q=emptyNewsQuery();q.search='zzz';const started=performance.now();expect(queryNews(docs,q,[]).rows).toEqual([]);expect(performance.now()-started).toBeLessThan(600);});
 it('R1: supplied alt text is searchable, LV placeholder wording is not, literal supplier text stays searchable',()=>{
  expect(newsMatchesSearch(item('<p>See <img alt="Revenue chart" src=x></p>'),'revenue chart')).toBe(true);
  expect(newsMatchesSearch(item('<p>See <img alt="Revenue chart" src=x></p>'),'image omitted')).toBe(false);
  expect(newsMatchesSearch(item('<p>Supplier wrote [image omitted: kept]</p>'),'image omitted: kept')).toBe(true);
 });
 it('R2: only recognized HTML elements are markup; other angle-bracket text is shown unchanged',()=>{
  expect(looksLikeMarkup('EPS<est and rev>guide')).toBe(false);expect(newsItemDisplay(item('EPS<est and rev>guide')).body).toBe('EPS<est and rev>guide');
  expect(t('<p>EPS<est and rev>guide</p>')).toBe('EPS<est and rev>guide');
  expect(t('<x-widget onclick="a()">w</x-widget>')).toBe('<x-widget onclick="a()">w</x-widget>');
  expect(looksLikeMarkup('a <B>bold</B> word')).toBe(true);expect(looksLikeMarkup('<br/>')).toBe(true);expect(looksLikeMarkup('<bread>')).toBe(false);
 });
 it('R2: a plain title is not entity-decoded when only the summary has markup',()=>{const d=newsItemDisplay(item('<p>body</p>','AT&amp;T &lt;x&gt;'));expect(d).toMatchObject({title:'AT&amp;T &lt;x&gt;',body:'body',markup:true});});
 it('R4: pruning evicts removed content; cost accounting returns to zero',()=>{
  retainNewsDisplayCache([]);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
  const kept=item('<p>kept</p>','Kept'),gone=item('<p>gone '+'y'.repeat(1000)+'</p>','Gone');newsItemDisplay(kept);newsItemDisplay(gone);expect(newsDisplayCacheStats().entries).toBe(2);
  const doc={id:'d',schemaVersion:1 as const,label:'Synthetic',importedAt:'2024-01-01T00:00:00.000Z',kind:'synthetic' as const,items:[kept]};
  expect(retainNewsDisplayCache([doc])).toBe(1);expect(newsDisplayCacheStats().entries).toBe(1);
  retainNewsDisplayCache([]);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
 });
 it('N1: zero-width and invisible format characters are stripped from link labels',()=>{expect(classifyNewsLink('https://good.example/','pay​pal⁠.com﻿؜').text).toBe('paypal.com');});
});
describe('re-review regressions',()=>{
 const doc=(id:string,n:number,title:(i:number)=>string,summary:(i:number)=>string=()=>'')=>({id,schemaVersion:1 as const,label:'Synthetic '+id,importedAt:'2024-01-01T00:00:00.000Z',kind:'synthetic' as const,items:Array.from({length:n},(_,i):NewsItem=>({id:id+i,title:title(i),summary:summary(i),provider:'P',publishedAt:'2024-01-01T00:00:00.000Z',sourceUrl:null,instruments:null,markets:null,sectors:null,corporateActivity:null,economics:null,countries:null,formats:null}))});
 const search=(docs:any[],term:string)=>{const q=emptyNewsQuery();q.search=term;const started=performance.now();queryNews(docs,q,[]);return performance.now()-started;};
 // Bound: 400 ms per keystroke (the review bound). The same-machine baseline predicate (raw
 // title+summary+provider lowercase includes) is measured alongside for the return packet.
 it('R6: a search keystroke over 20,000 headline-only items (shared empty summary) stays under 400 ms, cold and re-normalized',()=>{
  retainNewsDisplayCache([]);const docs=[doc('HA',10000,i=>'Company '+i+' reports results'),doc('HB',10000,i=>'Market update '+i)];
  expect(search(docs,'z')).toBeLessThan(1500);expect(search(docs,'zz')).toBeLessThan(400);
  const copies=docs.map(d=>({...d,items:d.items.map(item=>({...item}))}));expect(search(copies,'zzz')).toBeLessThan(400); // content layer, O(1) per item
 },30000);
 it('R7: a ~20 MiB import over the cache budget never re-converts unchanged items',()=>{
  retainNewsDisplayCache([]);const text='<p>'+'Some <b>bold</b> words and <a href="https://x.example/">a link</a>. '.repeat(30);const docs=[doc('M',10000,i=>'Story '+i,i=>text+i)];
  const chars=docs[0].items.reduce((n,item)=>n+item.summary.length,0);expect(chars).toBeGreaterThan(20_000_000);
  search(docs,'z');expect(newsDisplayCacheStats().cost).toBeLessThanOrEqual(NEWS_DISPLAY_CACHE_BUDGET);expect(newsDisplayCacheStats().cost).toBeGreaterThan(chars);expect(search(docs,'zz')).toBeLessThan(400);expect(search(docs,'zzz')).toBeLessThan(400);
  retainNewsDisplayCache([]);
 },30000);
 it('R7b: Watchlist Advanced re-normalized copies of a ~20 MiB import hit the content cache (each keystroke under 600 ms)',()=>{
  // advanced.ts:105 rebuilds item objects (restoreNewsState -> parseNews) on every query, so only the
  // content layer can hit. Each keystroke below parses fresh copies, as Advanced does.
  retainNewsDisplayCache([]);const text='<p>'+'Some <b>bold</b> words and <a href="https://x.example/">a link</a>. '.repeat(30);
  const raw={schemaVersion:1,label:'Synthetic Advanced path',kind:'synthetic',items:Array.from({length:10000},(_,i)=>({id:'i'+i,title:'Story '+i,summary:text+i,provider:'P',publishedAt:'2024-01-01T00:00:00Z'}))};
  const copy=()=>[parseNews(raw,'ADV','2024-01-01T00:00:00Z')];expect(copy()[0].items.reduce((n,item)=>n+item.summary.length,0)).toBeGreaterThan(20_000_000);
  search(copy(),'z');const stats=newsDisplayCacheStats();expect(stats.entries).toBe(10000);expect(stats.cost).toBeLessThanOrEqual(64_000_000);
  for(const term of ['zz','zzz']){const docs=copy();expect(search(docs,term)).toBeLessThan(600);}
  retainNewsDisplayCache([]);
 },30000);
 it('R2b: a recognized name in prose without valid tag syntax keeps all remaining text',()=>{
  expect(t('P<S ratio rose')).toBe('P<S ratio rose');expect(t('a<b')).toBe('a<b');
  expect(t('rates <select few> fell. More text here.')).toBe('rates <select few> fell. More text here.');
  expect(t('x<data and y>z')).toBe('x<data and y>z');expect(t('a</b and c>d')).toBe('a</b and c>d');
  expect(t('<p>Kept <select>after an unclosed drop element')).toBe('Kept after an unclosed drop element');
  expect(t('<input disabled>ok <b data-x aria-hidden>bold</b>')).toBe('ok bold');
  expect(looksLikeMarkup('P<S ratio rose')).toBe(false);expect(looksLikeMarkup('a<b')).toBe(false);
  expect(newsItemDisplay({...doc('R',1,()=>'T')[ 'items'][0],summary:'P<S ratio rose &amp; more'}).body).toBe('P<S ratio rose &amp; more');
 });
 it('R2b: prose-like "<b " floods stay linear',()=>{const started=performance.now();t('<p>'+'a <b c '.repeat(150000));t('<b "'.repeat(200000));t("<b a='".repeat(100000)+'<b a="'.repeat(100000));expect(performance.now()-started).toBeLessThan(1500);});
});
describe('search reads displayed text, not hidden markup',()=>{
 it('matches visible words and instruments but not attributes or script bodies',()=>{const item=parseNews({schemaVersion:1,label:'Synthetic hostile',kind:'synthetic',items:[{id:'h',title:'<b onmouseover="hidden1">Visible</b>',summary:'<script>hidden2</script><p>Body words</p>',provider:'Synthetic',publishedAt:'2024-01-01T00:00:00Z',instruments:['GME']}]},'d','2024-01-01T00:00:00Z').items[0];const s=newsSearchText(item);expect(s).toContain('visible');expect(s).toContain('body words');expect(s).toContain('gme');expect(s).not.toContain('hidden1');expect(s).not.toContain('hidden2');expect(s).not.toContain('<b');});
});
