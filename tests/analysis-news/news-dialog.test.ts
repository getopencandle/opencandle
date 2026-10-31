import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {NewsDialog} from '../../src/ui/NewsDialog';
import {createNewsState,emptyNewsQuery,parseNews,restoreNewsState,type NewsState} from '../../src/analysis-news/news';
import {normalizeSubmissions} from '../../src/analysis-news/filings';

// Real component handlers with controlled hooks (same harness as the publication dialog tests).
// No DOM, focus, paint, native picker or IPC: this is component-model evidence, not interface testing.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function all(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>[]{const found:ReactElement<any>[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found.push(node);visit(node.props.children);};visit(tree);return found;}
function find(tree:any,match:(node:ReactElement<any>)=>boolean){const [hit]=all(tree,match);if(!hit)throw Error('Synthetic handler target missing.');return hit;}
function mount(props:any){
 const render=()=>{hooks.cursor=0;return NewsDialog(props);},tree=()=>{render();return render();};
 const button=(label:string)=>find(tree(),n=>n.type==='button'&&(text(n.props.children)===label||n.props['aria-label']===label));
 const field=(label:string)=>find(tree(),n=>n.props['aria-label']===label);
 const has=(label:string)=>all(tree(),n=>n.props['aria-label']===label).length>0;
 const key=(target:string|((n:ReactElement<any>)=>boolean),k:string,extra:any={})=>{const node=find(tree(),typeof target==='string'?n=>n.props['aria-label']===target||n.props.className===target:target),ev={key:k,code:extra.code??'',shiftKey:!!extra.shiftKey,altKey:false,ctrlKey:false,metaKey:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),target:extra.target??{closest:()=>null},currentTarget:extra.currentTarget};node.props.onKeyDown(ev);return ev;};
 const rows=()=>all(tree(),n=>n.type==='button'&&'data-news-row' in n.props);
 return {props,render,tree,button,click:(label:string)=>button(label).props.onClick({currentTarget:null}),field,has,change:(label:string,value:any)=>{const node=field(label);// Select passes the chosen value directly; native inputs pass an event.
  node.props.onChange(typeof node.type==='function'?value:{target:typeof value==='boolean'?{checked:value}:{value}});},key,rows,status:()=>all(tree(),n=>n.props.role==='status').map(text).join(' '),allText:()=>text(tree())};
}
const at='2024-03-10T00:00:00Z';
const docA=()=>parseNews({schemaVersion:1,label:'Synthetic dialog fixture',kind:'synthetic',items:[
 {id:'a1',title:'Alpha one',summary:'Plain alpha body',provider:'P1',publishedAt:'2024-03-01T10:00:00Z',instruments:['GME'],sourceUrl:'https://news.example/alpha'},
 {id:'a2',title:'Beta two',provider:'P2',publishedAt:'2024-03-02T10:00:00Z',instruments:['SPY']},
 {id:'a3',title:'<b onmouseover="x()">Hostile</b> headline',summary:'<p>Intro</p><script>steal()</script><img src="https://tracker.example/p.gif" onerror="alert(1)"><a href="javascript:alert(1)">click me</a> <a href="data:text/html,x">data</a> <a href="https://ok.example/read">safe</a>',provider:'P3',publishedAt:'2024-03-03T10:00:00Z',instruments:['GME','SPY']},
]},'docA',at);
const stateWith=(...docs:ReturnType<typeof docA>[]):NewsState=>{const s=createNewsState();s.documents=docs;return s;};
const titles=(ui:ReturnType<typeof mount>)=>ui.rows().map(r=>text(find(r,n=>n.type==='strong')));
const readerTitle=(ui:ReturnType<typeof mount>)=>{const a=all(ui.tree(),n=>n.type==='article');return a.length?text(find(a[0],n=>n.type==='h3')):null;};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{hooks.cleanups.forEach(c=>c());vi.unstubAllGlobals();});
const base=(state:NewsState,extra:any={})=>({symbol:'GME',watchlist:['SPY'],state,filings:[],onChange:vi.fn(),onFilingsChange:vi.fn(),onClose:vi.fn(),...extra});

describe('news dialog states',()=>{
 it('distinguishes no supplied news, empty supplied documents and no matches',()=>{
  expect(mount(base(createNewsState())).allText()).toContain('No news is loaded.');
  expect(mount(base(stateWith({...docA(),items:[]}))).allText()).toContain('contain no items. Coverage is empty, not unavailable.');
  const ui=mount(base(stateWith(docA())));ui.change('Search news','no such words');expect(ui.allText()).toContain('No loaded stories match these filters.');
 });
 it('shows provenance on every headline row and in the document list',()=>{const ui=mount(base(stateWith(docA())));expect(ui.allText()).toContain('Demo data');for(const row of ui.rows()){const t=text(row);expect(t).toContain('Synthetic dialog fixture');expect(t).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);}expect(ui.allText()).toContain('Synthetic dialog fixture · synthetic test content · 3 items published 2024-03-01 10:00:00 UTC through 2024-03-03 10:00:00 UTC · 3 providers');});
});
describe('keyboard list and reader',()=>{
 it('Down highlights the first headline, Enter opens it, moving follows in the reader, Escape closes',()=>{
  const ui=mount(base(stateWith(docA())));expect(titles(ui)).toEqual(['Hostile headline','Beta two','Alpha one']);
  const list=ui.field('News headlines');ui.key('News headlines','ArrowDown');expect(ui.rows()[0].props['aria-current']).toBe('true');expect(readerTitle(ui)).toBeNull();
  ui.key('News headlines','End');expect(ui.rows()[2].props['aria-current']).toBe('true');
  ui.key('News headlines','Enter',{target:'self',currentTarget:'self'});expect(readerTitle(ui)).toBe('Alpha one');
  ui.key('News headlines','ArrowUp');expect(readerTitle(ui)).toBe('Beta two');
  ui.key('News headlines','Home');expect(readerTitle(ui)).toBe('Hostile headline');
  const space=ui.key('News headlines',' ');expect(space.preventDefault).toHaveBeenCalled();expect(readerTitle(ui)).toBe('Alpha one');
  const left=ui.key('News reader','ArrowLeft',{target:'article',currentTarget:'article'});expect(left.preventDefault).toHaveBeenCalled();expect(readerTitle(ui)).toBe('Alpha one');
  const esc=ui.key('News reader','Escape');expect(esc.stopPropagation).toHaveBeenCalled();expect(readerTitle(ui)).toBeNull();expect(ui.rows()[2].props['aria-current']).toBe('true');expect(list.props.tabIndex).toBe(0);expect(ui.field('News headlines').props.tabIndex).toBe(-1);
 });
 it('Escape closes the innermost layer first and only then lets the modal close',()=>{
  const ui=mount(base(stateWith(docA())));const panel='modal-scroll news-panel';
  ui.click('Instrument filter');expect(ui.has('Instrument filter values')).toBe(true);
  let ev=ui.key(panel,'Escape');expect(ev.stopPropagation).toHaveBeenCalled();expect(ui.has('Instrument filter values')).toBe(false);
  ui.rows()[1].props.onClick();expect(readerTitle(ui)).toBe('Beta two');
  ev=ui.key(panel,'Escape');expect(ev.stopPropagation).toHaveBeenCalled();expect(readerTitle(ui)).toBeNull();
  ev=ui.key(panel,'Escape');expect(ev.stopPropagation).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
  // The un-stopped Escape bubbles to the real Modal handler, which closes the dialog.
  vi.stubGlobal('document',{activeElement:null});const modal=ui.tree(),shell=(modal.type as any)(modal.props),bubbled={key:'Escape',nativeEvent:{isComposing:false},stopPropagation:vi.fn(),preventDefault:vi.fn()};shell.props.children.props.onKeyDown(bubbled);expect(ui.props.onClose).toHaveBeenCalledOnce();
 });
});
describe('stale selection',()=>{
 it('closes the reader with a notice when filters exclude the open story, and does not resurrect it',()=>{
  const ui=mount(base(stateWith(docA())));ui.rows()[2].props.onClick();expect(readerTitle(ui)).toBe('Alpha one');
  ui.change('Search news','beta');expect(readerTitle(ui)).toBeNull();expect(ui.status()).toContain('no longer in the current results');expect(titles(ui)).toEqual(['Beta two']);
  ui.change('Search news','');expect(titles(ui)).toHaveLength(3);expect(readerTitle(ui)).toBeNull();expect(ui.rows().some(r=>r.props['aria-current'])).toBe(false);
 });
 it('clears the selection when its source document is reloaded under a new identity',()=>{
  const props=base(stateWith(docA())),ui=mount(props);ui.rows()[0].props.onClick();expect(readerTitle(ui)).toBe('Hostile headline');
  props.state=stateWith(parseNews({schemaVersion:1,label:'Synthetic reloaded',kind:'synthetic',items:[{id:'a3',title:'Reloaded',provider:'P3',publishedAt:'2024-03-03T10:00:00Z'}]},'docA-reloaded',at));
  expect(readerTitle(ui)).toBeNull();expect(ui.status()).toContain('reader closed');expect(titles(ui)).toEqual(['Reloaded']);
 });
});
describe('second review regressions',()=>{
 it('R3: Revert closes the open filter menu, so the next Escape reaches the dialog',()=>{
  const ui=mount(base(stateWith(docA())));ui.change('Add news filter','markets');expect(ui.has('Market filter values')).toBe(true);
  ui.click('Revert to saved flow');expect(ui.has('Market filter values')).toBe(false);expect(ui.has('Search Market values')).toBe(false);
  const ev=ui.key('modal-scroll news-panel','Escape');expect(ev.stopPropagation).not.toHaveBeenCalled();
 });
 it('N2: the chart-symbol shortcut trims the symbol for both its count and its filter',()=>{const ui=mount(base(stateWith(docA()),{symbol:' GME '}));expect(text(ui.button('Show news for chart symbol GME').props.children)).toBe('GME only (2)');ui.click('Show news for chart symbol GME');expect(titles(ui)).toEqual(['Hostile headline','Alpha one']);});
});
describe('stale selection with a transiently invalid draft',()=>{
 it('keeps the open story while a reversed date range is being typed, without a misleading notice',()=>{
  const ui=mount(base(stateWith(docA())));ui.rows()[1].props.onClick();expect(readerTitle(ui)).toBe('Beta two');
  ui.change('News start date','2024-03-02');expect(readerTitle(ui)).toBe('Beta two');ui.change('News end date','2024-03-01');expect(ui.allText()).toContain('Start date must not follow end date.');expect(ui.status()).toBe('');
  ui.change('News end date','');expect(readerTitle(ui)).toBe('Beta two');expect(ui.status()).toBe('');
 });
});
describe('safe content handling',()=>{
 it('withholds a supplied source URL carrying bidirectional override characters',()=>{const doc=parseNews({schemaVersion:1,label:'Synthetic bidi',kind:'synthetic',items:[{id:'s',title:'Spoof test',provider:'P',publishedAt:'2024-03-01T00:00:00Z',sourceUrl:'https://evil.example/?‮moc.knab//:sptth'}]},'bidi',at);const ui=mount(base(stateWith(doc)));ui.rows()[0].props.onClick();expect(ui.has('Supplied source URL')).toBe(false);expect(ui.allText()).toContain('Source address withheld: Link contains control or bidirectional override characters.');});
 it('search does not match LV placeholder wording',()=>{const ui=mount(base(stateWith(docA())));ui.change('Search news','image omitted');expect(titles(ui)).toEqual([]);ui.change('Search news','unavailable after removing');expect(titles(ui)).toEqual([]);ui.change('Search news','intro');expect(titles(ui)).toEqual(['Hostile headline']);});
 it('renders hostile imported HTML as inert text with blocked links and no navigable or embedded elements',()=>{
  const ui=mount(base(stateWith(docA())));ui.rows()[0].props.onClick();const article=find(ui.tree(),n=>n.type==='article');
  expect(all(ui.tree(),n=>!!n.props.dangerouslySetInnerHTML)).toEqual([]);
  expect(all(ui.tree(),n=>['a','img','iframe','script','object','embed','webview'].includes(n.type as string))).toEqual([]);
  expect(all(ui.tree(),n=>'href' in n.props||'src' in n.props||'srcDoc' in n.props)).toEqual([]);
  const body=text(article);expect(readerTitle(ui)).toBe('Hostile headline');expect(body).toContain('Intro');expect(body).not.toContain('steal()');expect(body).not.toContain('<p>');expect(body).toContain('[image omitted]');expect(body).toContain('1 image was not loaded');
  expect(body).toContain('Blocked javascript: link scheme.');expect(body).toContain('Blocked data: link scheme.');expect(ui.field('Story link address 3').props).toMatchObject({readOnly:true,value:'https://ok.example/read'});
  ui.click('Show imported markup as text');const raw=find(ui.tree(),n=>n.props.className==='news-text');expect(raw.props.children).toBe(docA().items[2].summary);expect(typeof raw.props.children).toBe('string');
 });
 it('shows supplied source URLs read-only with their host, never as links',()=>{const ui=mount(base(stateWith(docA())));ui.rows()[2].props.onClick();expect(ui.field('Source URL').props).toMatchObject({readOnly:true,value:'https://news.example/alpha'});expect(ui.allText()).toContain('Source on news.example');});
});
describe('filters, reset and persistence',()=>{
 it('filter menu searches values, keeps stale saved values removable and applies literal results',()=>{
  const state=stateWith(docA());state.flows[0].query.values.instruments=['TSLA'];const ui=mount(base(state));expect(titles(ui)).toEqual([]);
  ui.click('Instrument filter, 1 selected');expect(ui.allText()).toContain('(not in imported news)');ui.change('Instrument TSLA',false);expect(titles(ui)).toHaveLength(3);
  ui.change('Search Instrument values','sp');expect(ui.has('Instrument GME')).toBe(false);ui.change('Instrument SPY',true);expect(titles(ui)).toEqual(['Hostile headline','Beta two']);
 });
 it('chart symbol shortcut, reset variants, unsaved indicator and revert',()=>{
  const ui=mount(base(stateWith(docA())));expect(ui.allText()).not.toContain('Unsaved filter changes');
  ui.click('Show news for chart symbol GME');expect(titles(ui)).toEqual(['Hostile headline','Alpha one']);expect(ui.allText()).toContain('Unsaved filter changes');
  ui.change('Search news','alpha');ui.change('News start date','2024-03-01');expect(titles(ui)).toEqual(['Alpha one']);
  ui.click('Reset all filters');expect(ui.field('Search news').props.value).toBe('alpha');expect(titles(ui)).toEqual(['Alpha one']);
  ui.click('Reset search, dates and filters');expect(ui.field('Search news').props.value).toBe('');expect(ui.field('News start date').props.value).toBe('');expect(titles(ui)).toHaveLength(3);expect(ui.has('Instrument filter')).toBe(true);
  ui.change('Search news','beta');ui.click('Revert to saved flow');expect(ui.field('Search news').props.value).toBe('');expect(ui.allText()).not.toContain('Unsaved filter changes');
 });
 it('Save flow persists the draft; a restored workspace reopens with the same filters and results',()=>{
  const onChange=vi.fn(),ui=mount(base(stateWith(docA()),{onChange}));ui.click('Show news for chart symbol GME');ui.change('News ordering','oldest');ui.change('News flow name','GME oldest');ui.click('Save flow');
  expect(onChange).toHaveBeenCalledOnce();const saved=restoreNewsState(JSON.parse(JSON.stringify(onChange.mock.calls[0][0])));expect(saved.flows[0]).toMatchObject({name:'GME oldest',query:{order:'oldest',values:{instruments:['GME']}}});
  hooks.cells=[];const reopened=mount(base(saved));expect(titles(reopened)).toEqual(['Alpha one','Hostile headline']);expect(reopened.field('News ordering').props.value).toBe('oldest');expect(reopened.allText()).not.toContain('Unsaved filter changes');
 });
 it('closing discards an unsaved draft: reopening uses the saved flow',()=>{const state=stateWith(docA()),ui=mount(base(state));ui.change('Search news','beta');expect(ui.props.onChange).not.toHaveBeenCalled();hooks.cells=[];const again=mount(base(state));expect(again.field('Search news').props.value).toBe('');expect(emptyNewsQuery().search).toBe('');});
});

describe('filings in the news list, read state and alerts',()=>{
 const filingDoc=()=>normalizeSubmissions({cik:1326380,name:'GameStop Corp.',filings:{recent:{accessionNumber:['0001326380-24-000010'],filingDate:['2024-03-26'],form:['10-K'],primaryDocument:['gme.htm']},files:[]}},{kind:'local-import',retrievedAt:at,sourceUrl:null,sha256:null},'local-filings:t');
 it('shows filings only after the toggle, says so when none are loaded, and lists them as SEC items',()=>{
  const none=mount(base(stateWith(docA())));none.change('Show filings in the news list',true);expect(none.allText()).toContain('No filings are loaded.');
  hooks.cells=[];const ui=mount(base(stateWith(docA()),{filings:[filingDoc()]}));expect(titles(ui)).not.toContain('10-K filing · GameStop Corp.');
  ui.change('Show filings in the news list',true);expect(titles(ui)).toContain('10-K filing · GameStop Corp.');
 });
 it('opening a story marks it read and the unread-only view hides it',()=>{
  const ui=mount(base(stateWith(docA())));expect(ui.allText()).toContain('3 unread');ui.rows()[0].props.onClick();expect(ui.allText()).toContain('2 unread');
  ui.change('Unread only',true);expect(ui.rows()).toHaveLength(2);
 });
 it('shows the new-item strip with previous and next, without a popup for the open flow',()=>{
  const onNewsAlert=vi.fn(),ui=mount(base(stateWith(docA()),{onNewsAlert}));ui.change('Alert on new matching stories',true);
  ui.props.state=stateWith({...docA(),items:[...docA().items,{...docA().items[0],id:'a9',title:'Fresh item'}]});ui.render();ui.render();
  // The flow being viewed gets no popup; the in-list strip and NEW badge below
  // still report it. The popup for another flow is pinned in tests/analysis-news/dl-gaps1-1028-news.test.ts.
  expect(onNewsAlert).not.toHaveBeenCalled();
  expect(ui.has('New story alerts')).toBe(true);expect(ui.allText()).toContain('NEW');ui.click('Next alert');
 });
});
