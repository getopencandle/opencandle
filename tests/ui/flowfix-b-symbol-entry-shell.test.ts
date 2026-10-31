import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {IntervalEntry} from '../../src/ui/IntervalEntry';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {SYMBOL_ENTRY_BLOCKERS} from '../../src/ui/symbol-search';

// The shell keeps its popup menus (Main menu, Layouts, Calendar views,
// Help ...) mounted with `hidden`, and the typed-entry blocker used to match them, so typing on the chart never
// opened the interval prompt or symbol search. This renders the actual App, builds a minimal SYNTHETIC document
// from the rendered element tree (hidden attributes inherited through ancestors), and drives the actual App
// keyboard handler. Hook model as in app-drawing-hotkeys-favorites.test.ts. Not a DOM, canvas or packaged test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
  useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps;hooks.effects.push(fn);}},
  useLayoutEffect:()=>{}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node))for(const child of node)findAll(child,test,out);
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
interface FakeElement {props:Record<string,any>;parent:FakeElement|null;closest(selector:string):FakeElement|null}
/** Matches the simple selector forms the blocker uses: [attr], [attr=value], [attr="value"], .class, tag. */
function matchesOne(props:Record<string,any>,type:unknown,selector:string):boolean{
 const s=selector.trim(),attr=/^\[([\w-]+)(?:=\"?([^\]\"]*)\"?)?\]$/.exec(s);
 if(attr){const name=attr[1],value=props[name];if(name==='hidden'||name==='inert')return !!value;if(attr[2]===undefined)return value!==undefined&&value!==false&&value!==null;return String(value)===attr[2];}
 if(s.startsWith('.'))return String(props.className??'').split(/\s+/).includes(s.slice(1));
 return typeof type==='string'&&type===s;
}
function fakeDom(tree:any){
 const all:FakeElement[]=[];
 const walk=(node:any,parent:FakeElement|null)=>{
  if(Array.isArray(node)){for(const child of node)walk(child,parent);return;}
  if(!node?.props)return;
  let self=parent;
  if(typeof node.type==='string'){
   const element:FakeElement={props:node.props,parent,closest(selector){const parts=selector.split(',');for(let at:FakeElement|null=element;at;at=at.parent)if(parts.some(part=>matchesOne(at!.props,'div',part)))return at;return null;}};
   (element as any).type=node.type;all.push(element);self=element;
  }
  walk(node.props.children,self);
 };
 walk(tree,null);
 const matching=(selector:string)=>all.filter(element=>selector.split(',').some(part=>matchesOne(element.props,(element as any).type,part)));
 return{all,querySelector:vi.fn((selector:string)=>matching(selector)[0]??null),querySelectorAll:vi.fn((selector:string)=>matching(selector)),getElementById:vi.fn(()=>null)};
}
function keyEvent(key:string){return{key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{tagName:'BODY',closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

async function setup(){
 const listeners=new Map<string,Function>();
 vi.stubGlobal('window',{addEventListener:vi.fn((name:string,fn:Function)=>listeners.set(name,fn)),removeEventListener:vi.fn((name:string,fn:Function)=>{if(listeners.get(name)===fn)listeners.delete(name);})});
 const doc={current:fakeDom(null)},docListeners=new Map<string,Set<Function>>();
 const fakeDocument:Record<string,unknown>={querySelector:(s:string)=>doc.current.querySelector(s),querySelectorAll:(s:string)=>doc.current.querySelectorAll(s),getElementById:()=>null};
 vi.stubGlobal('document',fakeDocument);
 const fire=(name:string,event:Record<string,unknown>)=>{for(const fn of [...docListeners.get(name)??[]])fn({defaultPrevented:false,isComposing:false,stopPropagation:vi.fn(),...event});};
 const render=()=>{hooks.cursor=0;const tree=App();doc.current=fakeDom(tree);return tree;};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<8;i++)await Promise.resolve();
 // Document listeners join only after boot, so startup takes the same route as the other App hook-model tests.
 Object.assign(fakeDocument,{addEventListener:(name:string,fn:Function)=>{(docListeners.get(name)??docListeners.set(name,new Set()).get(name)!).add(fn);},removeEventListener:(name:string,fn:Function)=>{docListeners.get(name)?.delete(fn);}});
 const keydown=()=>{render();let index=hooks.effects.findIndex(fn=>String(fn).includes('addEventListener'));while(index>=0){hooks.effects.splice(index,1)[0]!();index=hooks.effects.findIndex(fn=>String(fn).includes('addEventListener'));}const handler=listeners.get('keydown');if(!handler)throw Error('Missing keyboard listener');return handler;};
 /** Runs freshly scheduled effects that own document listeners (the Layout setup close effect among them). */
 let setupCleanup:unknown=null;
 const effects=()=>{render();for(const fn of hooks.effects.splice(0)){if(!String(fn).includes('addEventListener'))continue;const layoutClose=String(fn).includes('.lv-multichart > div:first-child');if(layoutClose&&typeof setupCleanup==='function'){setupCleanup();setupCleanup=null;}const out=fn();if(layoutClose)setupCleanup=out;}};
 return{render,keydown,doc,fire,effects,docListeners};
}

describe('FLOWFIX-B #1: typed entry on the chart with the shell popups mounted but closed',()=>{
 it('the rendered shell really carries hidden blocker menus (the condition that broke typed entry)',async()=>{
  const ui=await setup();ui.render();
  const hiddenMenus=ui.doc.current.querySelectorAll(SYMBOL_ENTRY_BLOCKERS).filter(element=>element.closest('[hidden]'));
  expect(hiddenMenus.map(element=>element.props['aria-label'])).toEqual(expect.arrayContaining(['Main menu','Layouts']));
 });
 it('typing a digit opens the interval prompt seeded with that digit',async()=>{
  const ui=await setup();const event=keyEvent('5');ui.keydown()(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  const prompt=find(ui.render(),node=>node.type===IntervalEntry);expect(prompt?.props.seed).toBe('5');
 });
 it('typing a letter opens symbol search seeded with that letter',async()=>{
  const ui=await setup();const event=keyEvent('a');ui.keydown()(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  const search=find(ui.render(),node=>node.type===SymbolSearchDialog);expect(search).toBeTruthy();
  expect(JSON.stringify(search.props,(key,value)=>typeof value==='function'?undefined:value)).toContain('"A"');
 });
 it('an open (not hidden) menu still blocks both prompts',async()=>{
  const ui=await setup();const handler=ui.keydown();
  const tree=ui.render(),main=find(tree,node=>node.props?.role==='menu'&&node.props['aria-label']==='Main menu');expect(main?.props.hidden).toBe(true);
  // Open the actual Main menu through its trigger, then type.
  find(tree,node=>node.props?.id==='lv-main-menu-trigger').props.onClick();
  const opened=find(ui.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Main menu');expect(opened.props.hidden).toBe(false);
  const digit=keyEvent('5'),letter=keyEvent('a');const live=ui.keydown();live(digit);live(letter);void handler;
  expect(digit.preventDefault).not.toHaveBeenCalled();expect(letter.preventDefault).not.toHaveBeenCalled();
  const after=ui.render();expect(find(after,node=>node.type===IntervalEntry)).toBeNull();expect(find(after,node=>node.type===SymbolSearchDialog)).toBeNull();
 });
});

describe('FLOWFIX-B #7: Layout setup closes on Escape and outside presses wherever focus is',()=>{
 const main=(tree:any)=>find(tree,node=>node.type==='main');
 const open=(ui:Awaited<ReturnType<typeof setup>>)=>{find(ui.render(),node=>node.props?.['aria-label']==='Layout setup').props.onClick({currentTarget:null});ui.effects();expect(main(ui.render()).props['data-layout-setup']).toBe('open');};
 const outside={closest:()=>null},panel={closest:(selector:string)=>selector.includes('.lv-multichart > div:first-child')?{}:null};
 it('Escape from the page body (focus left the chart workspace) closes it',async()=>{
  const ui=await setup();open(ui);const owned=(name:string)=>[...ui.docListeners.get(name)??[]].filter(fn=>String(fn).includes('closeLayoutSetup')).length;
  expect(owned('keydown')).toBe(1);expect(owned('pointerdown')).toBe(1);ui.fire('keydown',{key:'Escape',target:outside});
  expect(main(ui.render()).props['data-layout-setup']).toBeUndefined();
 });
 it('a press outside (watchlist, Save) closes it; a press inside the setup strip keeps it open',async()=>{
  const ui=await setup();open(ui);ui.fire('pointerdown',{target:panel});expect(main(ui.render()).props['data-layout-setup']).toBe('open');
  ui.fire('pointerdown',{target:outside});expect(main(ui.render()).props['data-layout-setup']).toBeUndefined();
 });
 it('Escape inside another open dialog or menu is left to that surface; other keys do nothing',async()=>{
  const ui=await setup();open(ui);
  ui.fire('keydown',{key:'Escape',target:{closest:(selector:string)=>selector.includes('[role=dialog]')?{}:null}});
  ui.fire('keydown',{key:'a',target:outside});ui.fire('keydown',{key:'Escape',target:outside,defaultPrevented:true});
  expect(main(ui.render()).props['data-layout-setup']).toBe('open');
  ui.effects();ui.fire('keydown',{key:'Escape',target:outside});ui.effects();expect(main(ui.render()).props['data-layout-setup']).toBeUndefined();
  const owned=(name:string)=>[...ui.docListeners.get(name)??[]].filter(fn=>String(fn).includes('closeLayoutSetup')).length;
  expect(owned('keydown')).toBe(0);expect(owned('pointerdown')).toBe(0);// the closed setup released its document listeners
 });
});
