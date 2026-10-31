import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {NewsDialog} from '../../src/ui/NewsDialog';
import {createNewsState,emptyNewsQuery,parseNews,queryNews,restoreNewsState,type NewsQuery,type NewsState} from '../../src/analysis-news/news';
import {classifyNewsLink,htmlToInertText,newsDisplayCacheStats,newsItemDisplay,newsSearchText,retainNewsDisplayCache} from '../../src/analysis-news/news-content';

// Independent second review (security focus). Every fixture here is synthetic and was
// written for this file; expected sets were derived by hand from the literal records below.
// Tests named "KNOWN DEFECT" use it.fails: they assert the desired behavior and currently fail.
// When the defect is fixed they turn red and should be flipped to plain it(). R1 and R3 were fixed by
// the builder and flipped in re-review 1; R2b, R6 and R7 were fixed and flipped in re-review 2. R7b was fixed and flipped in re-review 3.

// ---- controlled-hook harness (component handlers only; no DOM, focus or paint) ----
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return [hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(v:any):string=>typeof v==='string'?v:typeof v==='number'?String(v):Array.isArray(v)?v.map(text).join(''):v?.props?text(v.props.children):'';
function all(tree:any,match:(n:ReactElement<any>)=>boolean):ReactElement<any>[]{const out:ReactElement<any>[]=[];const visit=(n:any)=>{if(Array.isArray(n)){n.forEach(visit);return;}if(!n?.props)return;if(match(n))out.push(n);visit(n.props.children);};visit(tree);return out;}
function one(tree:any,match:(n:ReactElement<any>)=>boolean){const [hit]=all(tree,match);if(!hit)throw new Error('review harness: target missing');return hit;}
function mount(props:any){
 const render=()=>{hooks.cursor=0;return NewsDialog(props);},tree=()=>{render();return render();};
 const byLabel=(label:string)=>one(tree(),n=>n.props['aria-label']===label);
 const button=(label:string)=>one(tree(),n=>n.type==='button'&&(text(n.props.children)===label||n.props['aria-label']===label));
 const key=(label:string,k:string,extra:any={})=>{const node=one(tree(),n=>n.props['aria-label']===label||n.props.className===label);const ev={key:k,code:extra.code??'',shiftKey:!!extra.shiftKey,altKey:false,ctrlKey:false,metaKey:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),target:extra.target??{closest:()=>null},currentTarget:extra.currentTarget};node.props.onKeyDown(ev);return ev;};
 return {props,tree,byLabel,has:(label:string)=>all(tree(),n=>n.props['aria-label']===label).length>0,click:(label:string)=>button(label).props.onClick({currentTarget:null}),change:(label:string,value:any)=>{const node=byLabel(label);/* Select passes the chosen value directly; native inputs pass an event. */node.props.onChange(typeof node.type==='function'?value:{target:typeof value==='boolean'?{checked:value}:{value}});},key,
  rows:()=>all(tree(),n=>n.type==='button'&&'data-news-row' in n.props),reader:()=>{const a=all(tree(),n=>n.type==='article');return a.length?text(one(a[0],n=>n.type==='h3')):null;},status:()=>all(tree(),n=>n.props.role==='status').map(text).join(' '),allText:()=>text(tree())};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{hooks.cleanups.forEach(c=>c());vi.unstubAllGlobals();});
const PANEL='modal-scroll news-panel';

// ---- independent synthetic fixture ----
const at='2024-06-01T00:00:00Z';
const fixture=()=>parseNews({schemaVersion:1,label:'Synthetic review fixture X',kind:'synthetic',items:[
 {id:'x1',title:'Chip maker results',provider:'Wire',publishedAt:'2024-05-01T12:00:00Z',instruments:['AAA'],sectors:['Tech'],countries:['US']},
 {id:'x2',title:'Auto supplier note',provider:'Desk',publishedAt:'2024-05-02T00:00:00+02:00',instruments:['BBB','AAA'],countries:['DE']},
 {id:'x3',title:'Oil <i>update</i>',summary:'<p>Field <b>report</b></p><a href="https://ok.example/r">source</a>',provider:'Wire',publishedAt:'2024-05-03T08:00:00Z',sectors:['Energy']},
 {id:'x4',title:'Grid AAAX story',provider:'Desk',publishedAt:'2024-04-30T23:59:59Z',instruments:[],sectors:['Tech','Energy'],countries:['US']},
]},'X',at);
const ids=(q:NewsQuery,watch:string[]=[])=>{const r=queryNews([fixture()],q,watch);return {rows:r.rows.map(x=>x.id),unavailable:r.unavailable,total:r.total};};
const q=(edit:(q:NewsQuery)=>void)=>{const x=emptyNewsQuery();edit(x);return x;};
const stateWith=(...docs:ReturnType<typeof fixture>[]):NewsState=>{const s=createNewsState();s.documents=docs;return s;};
const props=(state:NewsState,extra:any={})=>({symbol:'AAA',watchlist:[],state,filings:[],onChange:vi.fn(),onFilingsChange:vi.fn(),onClose:vi.fn(),...extra});

describe('review: hostile markup stays inert text',()=>{
 it('drops executable, embedded and form content; entity-encoded tags stay literal text',()=>{
  const cases:[string,string][]=[
   ['<svg onload=alert(1)>x</svg>after','after'],
   ['<iframe srcdoc="<script>alert(1)</script>"></iframe>A','A'],
   ['<math><mi xlink:href="javascript:alert(1)">m</mi></math>z','z'],
   ['<textarea><img src=x></textarea>t','t'],
   ['<title>T</title>Body','Body'],
   ['<STYLE>*{x:url(javascript:alert(1))}</STYLE>ok','ok'],
   ['<!-- a <!-- b --> c -->d','c -->d'],
   ['<p>&lt;img src=x onerror=alert(1)&gt;</p>','<img src=x onerror=alert(1)>'],
  ];
  for(const [input,expected] of cases){const r=htmlToInertText(input);expect(r.text,input).toBe(expected);expect(r.links,input).toEqual([]);}
 });
 it('mutation-XSS and CDATA shapes reduce to plain strings with no link records',()=>{
  const m=htmlToInertText('<noscript><p title="</noscript><img src=x onerror=alert(1)>">');expect(m).toEqual({text:'[image omitted]">',links:[],images:1});
  const c=htmlToInertText('<![CDATA[<script>alert(1)</script>]]>tail');expect(c.text).toBe('alert(1)]]>tail');expect(c.links).toEqual([]);
  const b=htmlToInertText('<base href="https://evil.example/"><a href="/x">rel</a>');expect(b.links).toEqual([expect.objectContaining({text:'rel',status:'unresolved',href:null})]);
 });
});

describe('review: link classification',()=>{
 it('no hostile, obfuscated or relative target is ever external or carries an href',()=>{
  const hostile=['JaVaScRiPt:alert(1)','\u0001javascript:alert(1)','javascript\u0000:alert(1)',' \t\njavascript:alert(1)','jav&#x09;ascript:alert(1)','javascript&#58;alert(1)','javascript&colon;alert(1)','&#x2F;&#x2F;evil.example/x','\\\\evil.example\\share','/\\evil.example','VBSCRIPT:msgbox(1)','Data:text/html;base64,PHNjcmlwdD4=','FILE://c:/x','blob:null/x','filesystem:https://x.example/t','view-source:https://x.example','intent://x#Intent;end','\u00a0javascript:alert(1)','\u3000javascript:alert(1)','\ufeffjavascript:alert(1)','\u200bjavascript:alert(1)','\uff48\uff54\uff54\uff50\uff53://x.example','https://exa\u202emple.com','https://user@evil.example/','https://example.com:99999/','https://example.com/'+'a'.repeat(2040)];
  for(const h of hostile){const r=classifyNewsLink(h,'label');expect(r.status,JSON.stringify(h)).not.toBe('external');expect(r.href,JSON.stringify(h)).toBeNull();expect(r.host).toBeNull();}
 });
 it('look-alike and percent-encoded hosts are shown in canonical (punycode/decoded) form',()=>{
  expect(classifyNewsLink('https://\u0430pple.com/').host).toBe('xn--pple-43d.com');
  expect(classifyNewsLink('https://ex\u00ADample.com/').host).toBe('example.com');
  expect(classifyNewsLink('https://goo\u200Bgle.com/').host).toBe('google.com');
  expect(classifyNewsLink('https://%65vil.example/').host).toBe('evil.example');
  expect(classifyNewsLink('https:evil.example').href).toBe('https://evil.example/');
 });
 it('bidi and zero-width/invisible format characters are stripped from labels; host stays canonical',()=>{
  const r=htmlToInertText('<a href="https://good.example/">pay\u200Bpal\u2060.com\uFEFF\u061C\u180E\u202E</a>').links[0];
  expect(r).toMatchObject({text:'paypal.com',status:'external',host:'good.example',href:'https://good.example/'});
 });
});

describe('review: bounded work',()=>{
 it('tokenizer stays near-linear on 512 KiB adversarial inputs',()=>{
  const fill=(u:string,n:number)=>u.repeat(Math.ceil(n/u.length)).slice(0,n),n=1<<19,started=performance.now();
  for(const u of ['<p>','<','&amp;','<br>','<a href=x>yy','<img a a a>','<!--','<script>','</scriptx','<a "\''])htmlToInertText(fill(u,n));
  htmlToInertText('<a'+fill('x',n));htmlToInertText('<script>'+fill('</scriptx',n));
  expect(performance.now()-started).toBeLessThan(4000);
 });
 // R1 (fixed in re-review): the placeholder-strip regex was quadratic; the tokenizer now builds the search form.
 it('R1 (fixed): search over parse-valid items repeating "[image omitted: " stays fast',()=>{
  const chunk='<p>'+'[image omitted: '.repeat(1999);expect(chunk.length).toBeLessThanOrEqual(32000);
  const doc=parseNews({schemaVersion:1,label:'Synthetic placeholder stress',kind:'synthetic',items:Array.from({length:20},(_,i)=>({id:'s'+i,title:'Stress '+i,summary:chunk+i,provider:'P',publishedAt:'2024-01-01T00:00:00Z'}))},'stress',at);
  const started=performance.now();queryNews([doc],q(x=>{x.search='zzz';}),[]);expect(performance.now()-started).toBeLessThan(600);
 });
});

describe('review: literal filter results (independent fixture)',()=>{
 it('sector OR / missing metadata unavailable / definite mismatch wins over missing',()=>{
  expect(ids(q(x=>{x.visible.push('sectors');x.values.sectors=['Tech'];}))).toEqual({rows:['x1','x4'],unavailable:1,total:4});
  expect(ids(q(x=>{x.visible.push('sectors','countries');x.values.sectors=['Tech'];x.values.countries=['US'];}))).toEqual({rows:['x1','x4'],unavailable:0,total:4});
  expect(ids(q(x=>{x.values.instruments=['AAA'];x.values.provider=['Desk'];}))).toEqual({rows:['x2'],unavailable:0,total:4});
 });
 it('inclusive UTC day uses the normalized instant',()=>{expect(ids(q(x=>{x.from='2024-05-01';x.to='2024-05-01';})).rows).toEqual(['x2','x1']);});
 it('watchlist: empty list yields no rows and no unavailable count; null instruments are unavailable',()=>{
  expect(ids(q(x=>{x.watchlist=true;}),[])).toEqual({rows:[],unavailable:0,total:4});
  expect(ids(q(x=>{x.watchlist=true;}),['BBB'])).toEqual({rows:['x2'],unavailable:1,total:4});
 });
 it('empty supplied documents differ from no supplied documents',()=>{
  expect(queryNews([],emptyNewsQuery(),[])).toMatchObject({coverage:'unavailable',total:0});
  expect(queryNews([{...fixture(),items:[]}],emptyNewsQuery(),[])).toMatchObject({coverage:'supplied',total:0});
 });
});

describe('review: search widening (deliberate) and its reach',()=>{
 const baselinePredicate=(term:string)=>fixture().items.filter(i=>(i.title+' '+i.summary+' '+i.provider).toLocaleLowerCase().includes(term)).map(i=>i.id);
 it('instrument codes now match; a saved flow searching a ticker returns more rows than at baseline',()=>{
  expect(baselinePredicate('aaa')).toEqual(['x4']);
  expect(ids(q(x=>{x.search='aaa';})).rows).toEqual(['x2','x1','x4']);
 });
 it('markup is matched by its displayed text, not its tags (baseline matched raw tags)',()=>{
  expect(baselinePredicate('<i>')).toEqual(['x3']);expect(ids(q(x=>{x.search='<i>';})).rows).toEqual([]);
  expect(ids(q(x=>{x.search='oil update';})).rows).toEqual(['x3']);expect(ids(q(x=>{x.search='ok.example';})).rows).toEqual([]);
 });
 it('observation: a phrase can span provider and instrument fields',()=>{expect(newsSearchText(fixture().items[0])).toContain('wire aaa');expect(ids(q(x=>{x.search='wire aaa';})).rows).toEqual(['x1']);});
});

describe('review: persistence schema unchanged',()=>{
 it('a baseline-shaped saved state restores and keeps the exact NewsQuery key set',()=>{
  const saved={schemaVersion:1,documents:[JSON.parse(JSON.stringify(fixture()))],flows:[{id:'f1',name:'Old flow',query:{search:'chip',from:'',to:'',order:'oldest',watchlist:false,visible:['instruments','provider'],values:{instruments:['AAA'],markets:[],sectors:[],corporateActivity:[],economics:[],countries:[],provider:[],formats:[]}}}],activeFlowId:'f1',recentFlowIds:['f1']};
  const restored=restoreNewsState(saved);expect(Object.keys(restored.flows[0].query).sort()).toEqual(['from','order','search','to','values','visible','watchlist']);
  expect(queryNews(restored.documents,restored.flows[0].query,[]).rows.map(r=>r.id)).toEqual(['x1']);
  expect(restored.documents[0].items[2].title).toBe('Oil <i>update</i>');
  expect(newsItemDisplay(restored.documents[0].items[2]).title).toBe('Oil update');
 });
});

describe('review: dialog behavior',()=>{
 it('Escape layering: flow list, then reader, then the dialog',()=>{
  const ui=mount(props(stateWith(fixture())));ui.rows()[0].props.onClick();expect(ui.reader()).toBe('Oil update');
  ui.key(PANEL,'>',{code:'Period',shiftKey:true});expect(ui.has('Open news flows')).toBe(true);
  let ev=ui.key(PANEL,'Escape');expect(ev.stopPropagation).toHaveBeenCalled();expect(ui.has('Open news flows')).toBe(false);expect(ui.reader()).toBe('Oil update');
  ev=ui.key(PANEL,'Escape');expect(ev.stopPropagation).toHaveBeenCalled();expect(ui.reader()).toBeNull();
  ev=ui.key(PANEL,'Escape');expect(ev.stopPropagation).not.toHaveBeenCalled();
 });
 it('the reader follows the same story across a re-sort and closes with a notice when its document is removed',()=>{
  const p=props(stateWith(fixture())),ui=mount(p);ui.rows()[1].props.onClick();const open=ui.reader();expect(open).toBe('Auto supplier note');
  ui.change('News ordering','oldest');expect(ui.reader()).toBe(open);expect(ui.status()).toBe('');
  p.state=createNewsState();expect(ui.reader()).toBeNull();expect(ui.status()).toContain('reader closed');expect(ui.allText()).toContain('No news is loaded.');
 });
 it('rendered tree for a hostile story has no HTML sinks, navigable or embedded elements',()=>{
  const hostile=parseNews({schemaVersion:1,label:'Synthetic hostile review',kind:'synthetic',items:[{id:'h',title:'<svg onload=alert(1)></svg>Headline <img src=x onerror=alert(2)>',summary:'<iframe src="https://evil.example"></iframe><a href=" JaVa&#x09;Script:alert(3)">a</a><a href="//evil.example/">b</a><a href="https://ok.example/">c</a>',provider:'P',publishedAt:'2024-01-01T00:00:00Z',sourceUrl:'https://news.example/s'}]},'H',at);
  const ui=mount(props(stateWith(hostile)));ui.rows()[0].props.onClick();const tree=ui.tree();
  expect(all(tree,n=>!!n.props.dangerouslySetInnerHTML)).toEqual([]);
  expect(all(tree,n=>['a','img','iframe','object','embed','script','style','svg','webview','frame'].includes(n.type as string))).toEqual([]);
  expect(all(tree,n=>['href','src','srcDoc','formAction','action'].some(k=>k in n.props))).toEqual([]);
  const inputs=all(tree,n=>n.type==='input'&&typeof n.props.value==='string'&&/^https?:/i.test(n.props.value));
  expect(inputs.map(n=>[n.props.value,n.props.readOnly])).toEqual([['https://ok.example/',true],['https://news.example/s',true]]);
  expect(ui.reader()).toBe('Headline [image omitted]');expect(ui.allText()).toContain('Blocked javascript: link scheme.');expect(ui.allText()).toContain('Protocol-relative link has no trusted base address.');
 });
 // Revert removes an unsaved chip whose value menu is open; the hidden menu still counts as the
 // innermost Escape layer, so the first Escape is consumed with no visible effect.
 it('R3 (fixed): Escape is not swallowed by a filter menu that Revert already hid',()=>{
  const ui=mount(props(stateWith(fixture())));ui.change('Add news filter','markets');expect(ui.has('Market filter values')).toBe(true);
  ui.click('Revert to saved flow');expect(ui.has('Market filter values')).toBe(false);
  const ev=ui.key(PANEL,'Escape');expect(ev.stopPropagation).not.toHaveBeenCalled();
 });
 it('Reset search, dates and filters keeps controls and restores newest-first',()=>{
  const ui=mount(props(stateWith(fixture())));ui.change('Add news filter','sectors');ui.change('Sector Tech',true);ui.change('Search news','results');ui.change('News ordering','oldest');ui.change('News start date','2024-05-01');
  expect(ui.rows().map(r=>text(one(r,n=>n.type==='strong')))).toEqual(['Chip maker results']);
  ui.click('Reset search, dates and filters');expect(ui.rows()).toHaveLength(4);expect(ui.byLabel('News ordering').props.value).toBe('newest');expect(ui.has('Sector filter')).toBe(true);expect(ui.allText()).toContain('Unsaved filter changes');
 });
});

describe('re-review: R2 markup recognition',()=>{
 const body=(summary:string,title='T')=>newsItemDisplay({id:'r',title,summary,provider:'P',publishedAt:'2024-01-01T00:00:00.000Z',sourceUrl:null,instruments:null,markets:null,sectors:null,corporateActivity:null,economics:null,countries:null,formats:null});
 it('unknown element names are plain text; recognized tags in any case or spacing are still stripped',()=>{
  expect(body('EPS<est and rev>guide')).toMatchObject({body:'EPS<est and rev>guide',markup:false});
  expect(body('<x-widget a=1>t</x-widget>')).toMatchObject({body:'<x-widget a=1>t</x-widget>',markup:false});
  for(const s of ['<SCRIPT>x</SCRIPT>y','<Script >x</sCrIpT>y','<script\n>x</script\n>y'])expect(body(s).body,s).toBe('y');
  expect(body('<p>x</p>','AT&amp;T plain').title).toBe('AT&amp;T plain');
 });
 // R2b (fixed in re-review 2): a recognized name is a tag only with plausible tag syntax and a '>' within
 // 8,192 characters; an unclosed DROP element removes only its opening tag.
 it('R2b (fixed): plain prose with "<" before a recognized element name keeps its remaining text',()=>{
  expect(body('P<S ratio rose').body).toContain('ratio rose');
  expect(body('rates <select few> fell. More text here.').body).toContain('More text here');
 });
});

describe('re-review: R4 cache eviction',()=>{
 it('retainNewsDisplayCache evicts exactly the entries whose title+summary is no longer supplied',()=>{
  retainNewsDisplayCache([]);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
  const doc=parseNews({schemaVersion:1,label:'Synthetic eviction',kind:'synthetic',items:[0,1,2].map(i=>({id:'e'+i,title:'<b>T'+i+'</b>',summary:'<p>same</p>',provider:'P',publishedAt:'2024-01-01T00:00:00Z'}))},'E',at);
  for(const item of doc.items)newsItemDisplay(item);expect(newsDisplayCacheStats().entries).toBe(3);
  expect(retainNewsDisplayCache([{...doc,items:[doc.items[1]]}])).toBe(2);expect(newsDisplayCacheStats().entries).toBe(1);
  expect(newsItemDisplay(doc.items[0]).title).toBe('T0');
  retainNewsDisplayCache([]);expect(newsDisplayCacheStats()).toEqual({entries:0,cost:0});
 });
});

describe('re-review: cache structure performance',()=>{
 const docOf=(id:string,n:number,title:(i:number)=>string,summary?:(i:number)=>string)=>parseNews({schemaVersion:1,label:'Synthetic '+id,kind:'synthetic',items:Array.from({length:n},(_,i)=>({id:'i'+i,title:title(i),...(summary?{summary:summary(i)}:{}),provider:'P',publishedAt:'2024-01-01T00:00:00Z'}))},id,at);
 // R6 (fixed in re-review 2): the content cache was keyed by summary with a linear title scan (quadratic
 // for headline-only feeds, about 3 s per keystroke). Now summary -> Map<title> plus an identity WeakMap.
 // Re-review 2 measured 4-5 ms per warm keystroke for 20,000 headlines (baseline predicate about 9 ms).
 it('R6 (fixed): a search keystroke over 20,000 headline-only items stays fast',()=>{
  retainNewsDisplayCache([]);const docs=[docOf('HA',10000,i=>'Company '+i+' reports results'),docOf('HB',10000,i=>'Market update '+i)];
  queryNews(docs,q(x=>{x.search='z';}),[]);const started=performance.now();queryNews(docs,q(x=>{x.search='zz';}),[]);expect(performance.now()-started).toBeLessThan(400);
 });
 // R7 (fixed in re-review 2 for the dialog path): an over-budget LRU re-tokenized everything on every
 // keystroke (about 1.8 s). The identity WeakMap now serves unchanged item objects; about 7 ms measured.
 // R7b (fixed in re-review 3) covers re-normalized copies, as Watchlist Advanced makes, which still go through the LRU.
 it('R7 (fixed): a second keystroke over 10,000 ~2,000-character markup stories stays fast',()=>{
  retainNewsDisplayCache([]);const text='<p>'+'Some <b>bold</b> words and <a href="https://x.example/">a link</a>. '.repeat(30);const docs=[docOf('M',10000,i=>'Story '+i,i=>text+i)];
  queryNews(docs,q(x=>{x.search='z';}),[]);const started=performance.now();queryNews(docs,q(x=>{x.search='zz';}),[]);retainNewsDisplayCache([]);expect(performance.now()-started).toBeLessThan(400);
 });
});

describe('re-review 2',()=>{
 it('R2b edges: 8,192-character tag window, nested/adjacent tags, unclosed DROP keeps inert remainder',()=>{
  const tag=(k:number)=>'<b data-x="'+'y'.repeat(k)+'">in</b>';
  expect(htmlToInertText(tag(8181)).text).toBe('in');expect(htmlToInertText(tag(8182)).text.startsWith('<b data-x="')).toBe(true);
  expect(htmlToInertText('<b><i><u>deep</u></i></b>x').text).toBe('deepx');expect(htmlToInertText('</b></i>stray').text).toBe('stray');
  expect(htmlToInertText('Before<script>alert(1)').text).toBe('Before alert(1)');expect(htmlToInertText('<script>a<script>b</script>c').text).toBe('c');
  expect(htmlToInertText('a</b and c>d').text).toBe('a</b and c>d');
 });
 it('observation: the identity cache assumes items are immutable; a replaced object is re-converted',()=>{
  const item=parseNews({schemaVersion:1,label:'Synthetic mutation',kind:'synthetic',items:[{id:'m',title:'<b>Old</b>',provider:'P',publishedAt:'2024-01-01T00:00:00Z'}]},'MUT',at).items[0];
  expect(newsItemDisplay(item).title).toBe('Old');
  expect(newsItemDisplay({...item,title:'<b>New</b>'}).title).toBe('New');
  (item as {title:string}).title='<b>Mutated</b>';expect(newsItemDisplay(item).title).toBe('Old'); // stale by design; no src code mutates items
 });
 // R7b (fixed in re-review 3): Watchlist Advanced re-normalizes documents on every query (advanced.ts:105); its
 // copies miss the identity cache and used the former derived-only LRU (64M budget). The reviewer measured
 // 105-145 ms per warm keystroke for a ~20 MiB import versus 94-135 ms baseline (was about 2.1 s).
 // Integration correction: baseline and current App commit already call financialGuard, which measures
 // the complete proposed workspace before publication. The isolated oversized model did not prove App
 // acceptance. The integrated cache counts strong raw keys/search text and weakly references displays;
 // current-source performance still requires this test to run again under root's storage gate.
 it('R7b (fixed): a re-normalized (Watchlist Advanced) query over a ~20 MiB markup import stays fast',()=>{
  retainNewsDisplayCache([]);const text='<p>'+'Some <b>bold</b> words and <a href="https://x.example/">a link</a>. '.repeat(30);
  const raw={schemaVersion:1,label:'Synthetic Advanced',kind:'synthetic',items:Array.from({length:10000},(_,i)=>({id:'i'+i,title:'Story '+i,summary:text+i,provider:'P',publishedAt:'2024-01-01T00:00:00Z'}))};
  const copy=()=>[parseNews(raw,'ADV',at)];queryNews(copy(),q(x=>{x.search='z';}),[]);const docs=copy();
  const started=performance.now();queryNews(docs,q(x=>{x.search='zz';}),[]);const ms=performance.now()-started;retainNewsDisplayCache([]);expect(ms).toBeLessThan(600);
 });
});
