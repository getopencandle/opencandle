import {beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=fn();return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
// Actual GridCell event callbacks, controlled React lifecycle/element targets. No DOM claim.
it('inline text selection, caret keys and scrolling do not start or finish chart frame history gestures',()=>{
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const grid=MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 hooks.cells=[];hooks.cursor=0;const begin=vi.fn(()=>true),finish=vi.fn(),flush=vi.fn(),tree=cell.type({...cell.props,onBeginGesture:begin,onFinishGesture:finish,onNonGesture:flush});
 const node={isConnected:true};tree.props.ref.current=node;
 const event=(inline:boolean,key='ArrowLeft')=>({currentTarget:node,eventPhase:2,target:{closest:(selector:string)=>inline&&selector.includes('[data-lv-inline-editor]')?{}:null},button:0,key,shiftKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()});
 for(const name of ['onPointerDownCapture','onPointerUp','onPointerCancel','onWheelCapture','onKeyDownCapture'])tree.props[name](event(true));expect(begin).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(flush).not.toHaveBeenCalled();
 tree.props.onPointerDownCapture(event(false));tree.props.onPointerUp(event(false));tree.props.onWheelCapture(event(false));tree.props.onKeyDownCapture(event(false));expect(begin).toHaveBeenCalledTimes(3);expect(finish).toHaveBeenCalledTimes(3);
});
it('owned native drawing toolbar and floated popup inputs do not become chart gestures',()=>{
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const grid=MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 hooks.cells=[];hooks.cursor=0;const begin=vi.fn(()=>true),finish=vi.fn(),flush=vi.fn(),tree=cell.type({...cell.props,onBeginGesture:begin,onFinishGesture:finish,onNonGesture:flush});
 const panel=find(tree,node=>typeof node.type==='function'&&node.type.name==='ChartPanel');
 const target={closest:()=>null},outside={closest:()=>null},isDrawingChromeTarget=vi.fn(value=>value===target);
 panel.props.onReady({isDrawingChromeTarget,drawings:{getMode:()=>null}},null,'ordinary');
 hooks.cursor=0;const live=cell.type({...cell.props,onBeginGesture:begin,onFinishGesture:finish,onNonGesture:flush});const node={isConnected:true};live.props.ref.current=node;
 const event=(value:any)=>({currentTarget:node,eventPhase:2,target:value,button:0,key:'ArrowLeft',shiftKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()});
 for(const name of ['onPointerDownCapture','onPointerUp','onPointerCancel','onWheelCapture','onKeyDownCapture'])live.props[name](event(target));
 expect(isDrawingChromeTarget).toHaveBeenCalledTimes(5);expect(begin).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(flush).not.toHaveBeenCalled();
 live.props.onPointerDownCapture(event(outside));expect(begin).toHaveBeenCalledOnce();
});
it('current drawing refusal is rendered separately, can be dismissed and ignores a retired controller',()=>{
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),grid=MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const render=()=>{hooks.cursor=0;hooks.effects=[];return cell.type(cell.props);};let tree=render();
 let listener!:(message:string)=>void;const unsubscribe=vi.fn(),chart={onDrawingCommandError:(fn:typeof listener)=>{listener=fn;return unsubscribe;}};
 find(tree,node=>typeof node.type==='function'&&node.type.name==='ChartPanel').props.onReady(chart,null,'ordinary');tree=render();
 // Run the actual command-message subscription effect only. Other native
 // effects require a mounted renderer and are outside this controlled test.
 const effect=hooks.effects.find(fn=>String(fn).includes('onDrawingCommandError'))!;expect(effect).toBeDefined();const cleanup=effect() as ()=>void;
 listener('Synthetic capacity refusal. Existing drawings retained.');tree=render();expect(find(tree,node=>node.props.className==='drawing-command-message').props.role).toBe('alert');
 const dismiss=find(tree,node=>node.props['aria-label']==='Dismiss drawing message');dismiss.props.onClick();tree=render();expect(find(tree,node=>node.props.className==='drawing-command-message')).toBeNull();
 find(tree,node=>typeof node.type==='function'&&node.type.name==='ChartPanel').props.onReady({},null,'ordinary');listener('Old source error');tree=render();expect(find(tree,node=>node.props.className==='drawing-command-message')).toBeNull();cleanup();expect(unsubscribe).toHaveBeenCalledOnce();
});
