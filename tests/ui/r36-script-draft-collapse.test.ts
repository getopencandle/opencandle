import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {createScriptLibrary,selectedScript,type ScriptLibrary} from '../../src/ui/script-library';
import {initialScript} from '../../src/ui/ScriptPanel';
import {mountedBottomTabs,nextVisitedTabs,selectBottomTab,collapseBottomPanel,BOTTOM_PANEL_DEFAULT} from '../../src/ui/bottom-panel-model';

// Collapsing the bottom panel (or the rail toggle) saves the script editor's pending draft the way Close
// does; a tab switch keeps the editor mounted, so its draft timer still saves. Controlled hooks with effects run on dependency
// change (no DOM); the CodeMirror view is a double that hands back the editor's update listener. SYNTHETIC text only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
const views=vi.hoisted(()=>({listeners:[] as ((update:any)=>void)[],docs:[] as string[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
vi.mock('codemirror',async()=>{const actual=await vi.importActual<any>('codemirror');
 class FakeView{static updateListener={of:(fn:(update:any)=>void)=>{views.listeners.push(fn);return [];}};static theme=()=>[];static lineWrapping=[];
  text:string;state:any;scrollDOM={scrollTop:0};dom={querySelector:()=>null};
  constructor(config:{doc:string}){this.text=config.doc;views.docs.push(config.doc);const self=this;this.state={get doc(){return{toString:()=>self.text,length:self.text.length};},selection:{main:{anchor:0,head:0}}};}
  dispatch(){}destroy(){}focus(){}}
 return {...actual,EditorView:FakeView};});
function findAll(tree:any,match:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;views.listeners=[];views.docs=[];vi.useFakeTimers();});afterEach(()=>{vi.useRealTimers();});

/** A docked, embedded editor whose host element exists, so the editor effect builds a (double) view. */
function editor(){
 let library:ScriptLibrary=createScriptLibrary(initialScript);
 const onChange=vi.fn((next:ScriptLibrary)=>{library=next;return true;});
 const props:any={open:true,onClose:vi.fn(),chart:null,bars:[],fixture:true,identity:'Synthetic draft',library,onChange,bindings:[],onBindingsChange:vi.fn(),placement:'docked',onPlacement:vi.fn(),dockHost:null,embedded:true};
 const render=()=>{hooks.cursor=0;props.library=library;return ScriptLibraryPanel(props);};
 const tree=render();const host=findAll(tree,node=>node.props.ref&&typeof node.props.ref==='object'&&'current' in node.props.ref&&node.type==='div').find(node=>node.props.ref.current===null);
 if(!host)throw new Error('Synthetic editor host missing.');host.props.ref.current={};
 // A preference change re-runs the editor effect with the host present.
 library={...library,preferences:{...library.preferences,fontSize:library.preferences.fontSize+1}};render();
 if(!views.listeners.length)throw new Error('Synthetic editor view was not built.');
 const type=(text:string)=>views.listeners.at(-1)!({docChanged:true,state:{doc:{toString:()=>text}}});
 return {props,render,type,onChange,saved:()=>selectedScript(library).source};
}

describe(' script draft on collapse',()=>{
 it('type, collapse immediately, reopen: the draft is saved and the reopened editor shows it',()=>{
  const ui=editor(),text='({onBar(ctx){ctx.plot("Synthetic draft", ctx.bar.close);}})';
  ui.type(text);expect(ui.onChange).not.toHaveBeenCalled();
  ui.props.open=false;ui.render();
  expect(ui.onChange).toHaveBeenCalledTimes(1);expect(ui.saved()).toBe(text);
  vi.advanceTimersByTime(1000);expect(ui.onChange).toHaveBeenCalledTimes(1);
  ui.props.open=true;ui.render();expect(views.docs.at(-1)).toBe(text);
 });
 it('across a tab switch the editor stays mounted and its draft timer saves the text',()=>{
  const script={...BOTTOM_PANEL_DEFAULT,open:true,tab:'script' as const},strategy=selectBottomTab(script,'strategy'),visited=nextVisitedTabs(script,strategy,[]);
  expect(mountedBottomTabs(strategy,visited)).toContain('script');
  const ui=editor(),text='({onBar(ctx){/* synthetic tab switch */}})';
  ui.type(text);ui.render();vi.advanceTimersByTime(250);
  expect(ui.onChange).toHaveBeenCalledTimes(1);expect(ui.saved()).toBe(text);
  // Collapsing afterwards has nothing pending and saves nothing twice.
  expect(mountedBottomTabs(collapseBottomPanel(strategy),visited)).toEqual([]);ui.props.open=false;ui.render();expect(ui.onChange).toHaveBeenCalledTimes(1);
 });
});
