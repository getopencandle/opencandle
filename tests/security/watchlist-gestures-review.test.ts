import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {createWatchBook,restoreWatchBook} from '../../src/watchlists/model';
import {createWatchClicks,createWatchColumnResize,WATCH_CLICK_DELAY_MS} from '../../src/watchlists/gestures';
// Controlled actual Panel handlers plus pure gesture ports; no browser or native pointer evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,effects:new Map<number,()=>void>(),listeners:new Map<string,Set<(event:any)=>void>>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useMemo:(factory:()=>any,deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i].deps,deps))hooks.cells[i]={deps,value:factory()};return hooks.cells[i].value;},
 useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.effects.get(i)?.();hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.effects.set(i,cleanup);}}
};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function setup(){
 const props={book:createWatchBook(),datasets:[] as any[],onChange:vi.fn((next:any)=>{props.book=next;return true;}),onOpen:vi.fn((_source:any)=>true),onOpenAll:vi.fn((_source:any)=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const row=(id='initial-row-0')=>find(render(),node=>node.type==='tr'&&node.key===id).props;
 const separator=()=>find(render(),node=>node.props.role==='separator'&&node.props['aria-label']==='Resize Symbol column').props;
 const button=(label:string)=>find(render(),node=>node.type==='button'&&node.props['aria-label']===label).props.onClick;
 const key=(value:string)=>render().props.onKeyDown({key:value,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn(),altKey:false});
 const menuItem=(id:string)=>{button('Watchlist column menu')();return find(find(render(),node=>node.props?.role==='menu'),node=>node.type==='button'&&node.key===id).props.onClick;};
 return{props,render,row,separator,button,menuItem,key};
}
const click=(extra={})=>({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1,...extra});
const pointer=(pointerId:number,clientX:number)=>({pointerId,clientX,button:0,preventDefault:vi.fn(),stopPropagation:vi.fn(),currentTarget:{setPointerCapture:vi.fn(),hasPointerCapture:()=>false,releasePointerCapture:vi.fn()}});
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.effects.clear();hooks.listeners.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:(type:string,fn:any)=>{if(!hooks.listeners.has(type))hooks.listeners.set(type,new Set());hooks.listeners.get(type)!.add(fn);},removeEventListener:(type:string,fn:any)=>hooks.listeners.get(type)?.delete(fn)});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('Alt-modified row click and double-click never open active or all charts',()=>{
 const ui=setup();ui.row().onClick(click({altKey:true}));vi.advanceTimersByTime(WATCH_CLICK_DELAY_MS);ui.row().onDoubleClick(click({altKey:true,detail:2}));
 expect(ui.props.onOpen).not.toHaveBeenCalled();expect(ui.props.onOpenAll).not.toHaveBeenCalled();
});
// Clicks open at once (no queue to cancel) and arrow keys open the row they move to, as the reference app does.
it('a click opens its row at once and an arrow key opens the row it moves to',()=>{
 const ui=setup();ui.row().onClick(click());expect(ui.props.onOpen).toHaveBeenCalledOnce();expect(ui.props.onOpen.mock.calls[0][0].instrument.symbol).toBe('GME');
 ui.key('ArrowDown');expect(ui.row('initial-row-1')['aria-selected']).toBe(true);expect(ui.props.onOpen).toHaveBeenCalledTimes(2);expect(ui.props.onOpen.mock.calls[1][0].instrument.symbol).toBe('SPY');
 ui.key('Enter');expect(ui.props.onOpen).toHaveBeenCalledTimes(3);expect(ui.props.onOpen.mock.calls[2][0].instrument.symbol).toBe('SPY');
});
it('modal entry cancels an active resize before retained pointer-up can publish',()=>{
 const ui=setup(),edge=ui.separator();edge.onPointerDown(pointer(7,100));edge.onPointerMove(pointer(7,140));
 ui.menuItem('display')();ui.render();edge.onPointerUp(pointer(7,140));
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.book.display.widths.symbol).toBe(100);
});
it('unrelated pointer cancellation leaves the owning resize live and publishes exactly once',()=>{
 const ui=setup(),edge=ui.separator();edge.onPointerDown(pointer(7,100));edge.onPointerMove(pointer(7,140));
 edge.onPointerCancel(pointer(9,140));edge.onLostPointerCapture(pointer(9,140));edge.onPointerUp(pointer(7,140));edge.onPointerUp(pointer(7,140));
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.display.widths.symbol).toBe(140);
});
it('retired Panel resize handlers cannot publish after component effect cleanup',()=>{
 const ui=setup(),edge=ui.separator();for(const cleanup of hooks.effects.values())cleanup();const writes=hooks.writes;
 edge.onKeyDown({key:'ArrowRight',shiftKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()});
 edge.onPointerDown(pointer(7,0));edge.onPointerMove(pointer(7,20));edge.onPointerUp(pointer(7,20));
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.book.display.widths.symbol).toBe(100);expect(hooks.writes).toBe(writes);
});
it('click and Enter each open once around a drag; repeated pointer-up or rejected publication never commits twice',()=>{
 const ui=setup();ui.row().onClick(click());
 // The pointer reorder replaced the native drag. A live drag cancels the pending click state, and the click
 // that ends it is swallowed (no select, no open). The list element is faked: two 30 px rows under a 28 px header.
 const host=find(ui.render(),node=>node.props?.className==='wl-table').props.ref,classes=()=>({add:vi.fn(),remove:vi.fn()});
 host.current={scrollTop:0,classList:classes(),appendChild:vi.fn(),getBoundingClientRect:()=>({top:0,bottom:400}),querySelector:()=>null,querySelectorAll:()=>['initial-row-0','initial-row-1'].map((id,i)=>({dataset:{wlRowId:id},style:{},classList:classes(),getBoundingClientRect:()=>({top:28+30*i,height:30})}))};
 const at={pointerId:1,button:0,currentTarget:{setPointerCapture:vi.fn(),hasPointerCapture:()=>false},target:{closest:()=>null}};
 ui.row().onPointerDown({...at,clientY:43});ui.row().onPointerMove({...at,clientY:50});vi.runAllTimers();expect(ui.props.onOpen).toHaveBeenCalledOnce();
 ui.row().onPointerMove({...at,clientY:44});ui.row().onPointerUp(at);ui.row().onClick(click());vi.runAllTimers();expect(ui.props.onOpen).toHaveBeenCalledOnce();expect(ui.props.onChange).not.toHaveBeenCalled();
 ui.key('Enter');vi.runAllTimers();expect(ui.props.onOpen).toHaveBeenCalledTimes(2);
 const book=ui.props.book;ui.props.onChange.mockReturnValue(false);const edge=ui.separator();edge.onPointerDown(pointer(5,0));edge.onPointerMove(pointer(5,20));edge.onPointerUp(pointer(5,20));edge.onPointerUp(pointer(5,20));
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book).toBe(book);expect(find(ui.render(),node=>node.props.role==='status').props.children).toMatch(/rejected/i);
});
it('a blocked owner and disposal suppress opens; each click reads the current book',()=>{
 let book=createWatchBook(),blocked=true;const open=vi.fn(),clicks=createWatchClicks({read:()=>({book,datasets:[],blocked}),open,error:()=>{}});
 clicks.click('initial-row-0');clicks.doubleClick('initial-row-0');expect(open).not.toHaveBeenCalled();
 blocked=false;book=restoreWatchBook({...book,lastFlag:'blue'});clicks.click('initial-row-0');expect(open).toHaveBeenCalledOnce();
 clicks.dispose();clicks.click('initial-row-0');clicks.doubleClick('initial-row-0');expect(open).toHaveBeenCalledOnce();
});
it('declares late OS double delivery as an additional all-chart request, while timely modified/triple events cannot replay a single',()=>{
 const book=createWatchBook(),datasets:[]=[],seen:boolean[]=[],clicks=createWatchClicks({read:()=>({book,datasets,blocked:false}),open:(_,all)=>seen.push(all),error:()=>{}});
 clicks.click('initial-row-0');vi.advanceTimersByTime(WATCH_CLICK_DELAY_MS);clicks.doubleClick('initial-row-0');expect(seen).toEqual([false,true]);
 clicks.click('initial-row-1');clicks.doubleClick('initial-row-1',true);clicks.click('initial-row-1',false,3);vi.runAllTimers();expect(seen).toEqual([false,true,false]);
});
it('resize owner replacement and keyboard no-ops retain accepted width with cleared preview',()=>{
 let book=createWatchBook();const publish=vi.fn(),preview=vi.fn(),resize=createWatchColumnResize({read:()=>book,publish,preview});
 resize.begin('symbol',3,0);resize.move(3,20);book=restoreWatchBook({...book,lastFlag:'blue'});expect(()=>resize.finish(3)).toThrow(/changed/);expect(publish).not.toHaveBeenCalled();expect(preview).toHaveBeenLastCalledWith(null);
 expect(resize.key('symbol','NotAKey')).toBe(false);expect(publish).not.toHaveBeenCalled();expect(book.display.widths.symbol).toBe(100);
});
it('resize disposal has no late port effects and explicit enable restores one new owned gesture',()=>{
 let book=createWatchBook();const read=vi.fn(()=>book),publish=vi.fn((next:any)=>{book=next;}),preview=vi.fn(),resize=createWatchColumnResize({read,publish,preview});
 resize.begin('symbol',1,0);resize.move(1,20);resize.dispose();const reads=read.mock.calls.length,previews=preview.mock.calls.length;
 resize.begin('symbol',2,0);resize.move(2,40);resize.finish(2);resize.cancel();expect(resize.key('symbol','ArrowRight')).toBe(false);
 expect(read).toHaveBeenCalledTimes(reads);expect(preview).toHaveBeenCalledTimes(previews);expect(publish).not.toHaveBeenCalled();
 resize.enable();resize.begin('symbol',3,0);resize.move(3,40);resize.finish(3);resize.finish(3);expect(publish).toHaveBeenCalledOnce();expect(book.display.widths.symbol).toBe(140);
});
it('Advanced View entry cancels resize (an earlier click already opened) while its retained retired button cannot open',()=>{
 const ui=setup(),advanced=vi.fn(()=>true);Object.assign(ui.props,{onAdvanced:advanced});
 const openAdvanced=()=>ui.menuItem('advanced');
 ui.row().onClick(click());openAdvanced()();vi.runAllTimers();expect(ui.props.onOpen).toHaveBeenCalledOnce();expect(advanced).toHaveBeenCalledOnce();
 const edge=ui.separator();edge.onPointerDown(pointer(7,0));edge.onPointerMove(pointer(7,40));const button=openAdvanced();button();edge.onPointerUp(pointer(7,40));expect(ui.props.onChange).not.toHaveBeenCalled();
 for(const cleanup of hooks.effects.values())cleanup();const calls=advanced.mock.calls.length,writes=hooks.writes;button();expect(advanced).toHaveBeenCalledTimes(calls);expect(hooks.writes).toBe(writes);
});
