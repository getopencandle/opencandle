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
 const key=(target:string|((n:ReactElement<any>)=>boolean),k:string,extra:any={})=>{const node=find(tree(),typeof target==='string'?n=>n.props['aria-label']===target||n.props.className===target:target),ev={key:k,code:extra.code??'',shiftKey:!!extra.shiftKey,altKey:!!extra.altKey,ctrlKey:false,metaKey:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),stopPropagation:vi.fn(),target:extra.target??{closest:()=>null},currentTarget:extra.currentTarget};node.props.onKeyDown(ev);return ev;};
 const rows=()=>all(tree(),n=>n.type==='button'&&'data-news-row' in n.props);
 return {props,render,tree,button,click:(label:string)=>button(label).props.onClick({currentTarget:null}),field,has,change:(label:string,value:any)=>{const node=field(label);// Select passes the chosen value directly; native inputs pass an event.
  node.props.onChange(typeof node.type==='function'?value:{target:typeof value==='boolean'?{checked:value}:{value}});},key,rows,status:()=>all(tree(),n=>n.props.role==='status').map(text).join(' '),allText:()=>text(tree())};
}
import {collapseDuplicateStories,duplicateStoryKey,filterNewsLanguage} from '../../src/analysis-news/news-view';
// News flow menu, reader focus, alert rules and the pause / context menu / duplicates / language views.
// SYNTHETIC fixtures only. Controlled hooks; onChange writes the accepted state back like the workspace does.
const at='2024-03-10T00:00:00Z';
const item=(id:string,title:string,publishedAt:string,extra:any={})=>({id,title,provider:'P1',publishedAt,instruments:['GME'],...extra});
const doc=(id:string,items:any[])=>parseNews({schemaVersion:1,label:'Synthetic '+id,kind:'synthetic',items},id,at);
const docA=()=>doc('docA',[item('a1','Alpha one','2024-03-01T10:00:00Z',{sourceUrl:'https://news.example/alpha'}),item('a2','Beta two','2024-03-02T10:00:00Z',{instruments:['SPY']})]);
const twoFlows=(...docs:any[]):NewsState=>{const s=createNewsState();s.documents=docs;s.flows=[...s.flows,{id:'b',name:'Second',query:emptyNewsQuery()}];return s;};
const stateWith=(...docs:any[]):NewsState=>{const s=createNewsState();s.documents=docs;return s;};
function live(state:NewsState,extra:any={}){const props:any={symbol:'GME',watchlist:[],state,filings:[],onFilingsChange:vi.fn(),onClose:vi.fn(),...extra};props.onChange=vi.fn((next:NewsState)=>{props.state=next;});return mount(props);}
const titles=(ui:ReturnType<typeof mount>)=>ui.rows().map(r=>text(find(r,n=>n.type==='strong')));
const panel='modal-scroll news-panel';
let stored:string|null=null;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];stored=null;vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('localStorage',{getItem:()=>stored,setItem:(_k:string,v:string)=>{stored=v;}});});
afterEach(()=>{hooks.cleanups.forEach(c=>c());vi.unstubAllGlobals();});
const savedLocal=()=>JSON.parse(stored??'null');

describe('news flow menu (AN.NEWS.FLOW.*)',()=>{
 it('CREATE: the menu button and Shift+Alt+N add an empty flow and switch to it',()=>{
  const ui=live(stateWith(docA()));ui.click('Create new flow');
  let next=ui.props.state as NewsState;expect(next.flows.length).toBe(2);expect(next.activeFlowId).toBe(next.flows[1].id);expect(next.flows[1].name).toBe('New flow');expect(next.flows[1].query).toEqual(emptyNewsQuery());
  ui.key(panel,'N',{code:'KeyN',shiftKey:true,altKey:true});next=ui.props.state;expect(next.flows.length).toBe(3);expect(next.activeFlowId).toBe(next.flows[2].id);
 });
 it('RENAME_MENU keeps the flow identity and query; an empty name is refused',()=>{
  const ui=live(stateWith(docA()));ui.change('News flow name','Gamers');ui.click('Rename flow');
  const next=ui.props.state as NewsState;expect(next.flows).toHaveLength(1);expect(next.flows[0]).toMatchObject({id:'all-news',name:'Gamers'});expect(next.flows[0].query).toEqual(emptyNewsQuery());
  ui.change('News flow name','  ');ui.click('Rename flow');expect(ui.allText()).toContain('Enter a flow name with 1 to 100 characters.');expect((ui.props.state as NewsState).flows[0].name).toBe('Gamers');
 });
 it('RENAME_DIALOG renames an inactive flow without touching the others',()=>{
  // The row editor is the FlowRename child component; its Rename button calls this handler with the draft name.
  const ui=live(twoFlows(docA()));ui.click('Open flows');find(ui.tree(),n=>n.props.id==='b'&&typeof n.props.onRename==='function').props.onRename('b','Earnings');
  const next=ui.props.state as NewsState;expect(next.flows.map(f=>[f.id,f.name])).toEqual([['all-news','All news'],['b','Earnings']]);expect(next.activeFlowId).toBe('all-news');
 });
 it('SAVE_SHORTCUT: Shift+Alt+S saves the draft on the News tab only',()=>{
  const ui=live(stateWith(docA()));ui.change('Search news','alpha');ui.key(panel,'S',{code:'KeyS',shiftKey:true,altKey:true});
  expect((ui.props.state as NewsState).flows[0].query.search).toBe('alpha');expect(ui.props.onChange).toHaveBeenCalledTimes(1);
  ui.click('SEC filings');ui.key(panel,'S',{code:'KeyS',shiftKey:true,altKey:true});expect(ui.props.onChange).toHaveBeenCalledTimes(1);
 });
 it('SEARCH lists only saved flows whose name contains the text, case-insensitively',()=>{
  const ui=live(twoFlows(docA()));ui.click('Open flows');ui.change('Search saved flows','SEC');
  const list=find(ui.tree(),n=>n.props['aria-label']==='Open news flows');expect(all(list,n=>n.type==='button'&&text(n)==='Second')).toHaveLength(1);expect(all(list,n=>n.type==='button'&&text(n)==='All news')).toHaveLength(0);
 });
 it('DELETE asks first, then removes the flow and its alert (AN.NEWS.ALERT.DELETE_FLOW)',()=>{
  const ui=live(twoFlows(docA()));ui.change('Selected news flow','b');ui.change('Alert on new matching stories',true);expect(savedLocal().alertFlowIds).toEqual(['b']);
  ui.click('Delete flow');expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.allText()).toContain('Delete Second for good? Its alert is removed too.');
  ui.click('Keep Second');expect(ui.has('Open news flows')).toBe(true);expect((ui.props.state as NewsState).flows).toHaveLength(2);
  ui.click('Delete Second');ui.click('Confirm delete Second');
  const next=ui.props.state as NewsState;expect(next.flows.map(f=>f.id)).toEqual(['all-news']);expect(next.activeFlowId).toBe('all-news');expect(savedLocal().alertFlowIds).toEqual([]);expect(savedLocal().pending).toEqual([]);
 });
});
describe('reader focus and alert rules',()=>{
 it('FOCUS_READER: Tab or Right moves to the open story only',()=>{
  const ui=live(stateWith(docA()));expect(ui.key('News headlines','ArrowRight').preventDefault).not.toHaveBeenCalled();
  ui.rows()[0].props.onClick();expect(ui.key('News headlines','ArrowRight').preventDefault).toHaveBeenCalled();expect(ui.key('News headlines','Tab').preventDefault).toHaveBeenCalled();
  expect(ui.key('News headlines','Tab',{shiftKey:true}).preventDefault).not.toHaveBeenCalled();
 });
 it('OPEN_SUPPRESSION: a new story raises a popup for another alerted flow, not for the open one',()=>{
  stored=JSON.stringify({schemaVersion:1,showFilings:false,alertFlowIds:['all-news','b'],read:[],known:null,pending:[]});
  const onNewsAlert=vi.fn(),ui=live(twoFlows(docA()),{onNewsAlert});ui.render();expect(onNewsAlert).not.toHaveBeenCalled();
  ui.props.state={...ui.props.state,documents:[doc('docA',[...docA().items,item('a9','Fresh item','2024-03-05T10:00:00Z')])]};ui.render();ui.render();
  expect(onNewsAlert).toHaveBeenCalledTimes(1);expect(onNewsAlert.mock.calls[0][0]).toBe('News alert: 1 new story matches the flow "Second".');
  expect(ui.allText()).toContain('1 new in this flow');expect(ui.allText()).toContain('1 new in Second');
 });
 it('SLEEP: the alert control states the local-only limits',()=>{
  const t=live(stateWith(docA())).allText();expect(t).toContain('Nothing is delivered while OpenCandle is closed or the computer sleeps, and there is no server or push delivery.');expect(t).toContain('OpenCandle checks for new matching stories only while News is open');
 });
});
describe('LV-defined news views (AN.NEWS.U.*)',()=>{
 it('REFRESH_PAUSE_AUTOSCROLL: paused lists keep their stories and count held imports until Resume',()=>{
  const ui=live(stateWith(docA()));ui.click('Pause updates');
  ui.props.state={...ui.props.state,documents:[...ui.props.state.documents,doc('docB',[item('b1','Gamma three','2024-03-04T10:00:00Z')])]};
  expect(titles(ui)).toEqual(['Beta two','Alpha one']);expect(ui.button('Resume updates (1 new)').props['aria-pressed']).toBe(true);expect(ui.allText()).toContain('The headline list never scrolls by itself.');
  ui.click('Resume updates (1 new)');expect(titles(ui)).toEqual(['Gamma three','Beta two','Alpha one']);
 });
 it('ARTICLE_CONTEXT_MENU: right click or Shift+F10 opens story actions; Escape closes it first',async()=>{
  const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
  const ui=live(stateWith(docA())),ev={preventDefault:vi.fn(),clientX:40,clientY:60};ui.rows()[1].props.onContextMenu(ev);expect(ev.preventDefault).toHaveBeenCalled();
  const menu=()=>find(ui.tree(),n=>n.props.role==='menu');expect(menu().props.style).toEqual({left:40,top:60});
  expect(all(menu(),n=>n.props.role==='menuitem').map(text)).toEqual(['Open story','Mark as read','Copy headline','Copy source address','Show only GME stories','Close menu']);
  ui.click('Copy headline');await Promise.resolve();await Promise.resolve();expect(writeText).toHaveBeenCalledWith('Alpha one');expect(ui.status()).toContain('Headline copied.');expect(ui.has('Story actions')).toBe(false);
  ui.key('News headlines','F10',{shiftKey:true});expect(ui.has('Story actions')).toBe(true);ui.click('Mark as read');expect(ui.rows()[1].props.className).toMatch(/(^| )read$/);
  ui.key('News headlines','ContextMenu');expect(text(menu())).toContain('Mark as unread');
  const esc=ui.key(panel,'Escape');expect(esc.stopPropagation).toHaveBeenCalled();expect(ui.has('Story actions')).toBe(false);
  ui.rows()[0].props.onContextMenu(ev);expect(find(menu(),n=>text(n)==='Copy source address').props.disabled).toBe(true);ui.click('Show only SPY stories');expect(titles(ui)).toEqual(['Beta two']);
 });
 it('DUPLICATE_STORIES folds equal headlines within 72 hours across providers',()=>{
  const d=doc('dup',[item('d1','Alpha beats estimates','2024-03-03T10:00:00Z'),item('d2','ALPHA beats estimates!','2024-03-03T12:00:00Z',{provider:'P2'}),item('d3','<b>Alpha</b> beats estimates','2024-03-07T12:00:00Z'),item('d4','Other','2024-03-03T11:00:00Z')]);
  const ui=live(stateWith(d));expect(titles(ui)).toHaveLength(4);ui.change('Hide duplicate stories',true);
  expect(titles(ui)).toEqual(['Alpha beats estimates','ALPHA beats estimates!','Other']);expect(text(ui.rows()[1])).toContain('+1 similar');expect(ui.allText()).toContain('1 folded');
  expect(duplicateStoryKey('<i>Alpha</i>, beats  ESTIMATES.')).toBe('alpha beats estimates');
  expect(collapseDuplicateStories([{title:'',publishedAt:at},{title:'',publishedAt:at}],()=>'k').rows).toHaveLength(2);
 });
 it('LANGUAGE_FALLBACK: a language keeps matching tags and falls back to all languages when none match',()=>{
  const d=doc('lang',[item('l1','English','2024-03-01T10:00:00Z',{language:'en'}),item('l2','British','2024-03-02T10:00:00Z',{language:'en-GB'}),item('l3','Francais','2024-03-03T10:00:00Z',{language:'FR'}),item('l4','Untagged','2024-03-04T10:00:00Z')]);
  expect(d.items.map(i=>i.language)).toEqual(['en','en-GB','fr',undefined]);
  const ui=live(stateWith(d));expect(ui.field('News language').props.options.map((o:any)=>o.value)).toEqual(['','en','en-GB','fr']);
  ui.change('News language','en');expect(titles(ui)).toEqual(['British','English']);
  ui.change('Search news','francais');expect(titles(ui)).toEqual(['Francais']);expect(ui.allText()).toContain('No stories in en match, so stories in all languages are shown.');
  expect(filterNewsLanguage([{language:'fr'}],'')).toEqual({rows:[{language:'fr'}],fellBack:false});expect(filterNewsLanguage([],'en').fellBack).toBe(false);
  expect(()=>doc('bad',[item('x','X','2024-03-01T10:00:00Z',{language:'english language'})])).toThrow('Invalid news language tag.');
 });
});
