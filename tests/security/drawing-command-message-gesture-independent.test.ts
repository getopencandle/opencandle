import {beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=fn();return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

it('the actual drawing refusal alert and Dismiss controls do not begin chart frame gestures',()=>{
 const data=fixtureDataset('GME',3),state=createMultiChartState(data,{appearance:defaultTheme.appearance});
 const grid=MultiChartGrid({state,datasets:[data],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];const begin=vi.fn(()=>true),finish=vi.fn(),flush=vi.fn();
 const render=()=>{hooks.cursor=0;hooks.effects=[];return cell.type({...cell.props,onBeginGesture:begin,onFinishGesture:finish,onNonGesture:flush});};let tree=render();let listener!:(message:string)=>void;
 find(tree,node=>typeof node.type==='function'&&node.type.name==='ChartPanel').props.onReady({onDrawingCommandError(fn:typeof listener){listener=fn;return()=>{};},isDrawingChromeTarget:()=>false},null,'ordinary');tree=render();
 const effect=hooks.effects.find(fn=>String(fn).includes('onDrawingCommandError'))!;expect(effect).toBeDefined();const cleanup=effect() as ()=>void;
 try{
  listener('SYNTHETIC workspace quota refusal');tree=render();const alert=find(tree,node=>node.props.className==='drawing-command-message'),dismiss=find(tree,node=>node.props['aria-label']==='Dismiss drawing message');expect(alert).not.toBeNull();expect(dismiss).not.toBeNull();
  // Controlled ancestor matching uses attributes/classes from the actual
  // returned alert element; no browser/layout or DOM painting is claimed.
  const target={closest(selector:string){return selector.split(',').some(part=>{const key=part.trim();return key.startsWith('.')?String(alert.props.className).split(' ').includes(key.slice(1)):key.startsWith('[')&&key.endsWith(']')&&Object.hasOwn(alert.props,key.slice(1,-1));})?target:null;}};
  const event=()=>({target,button:0,key:'ArrowLeft',shiftKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()});
  for(const key of ['onPointerDownCapture','onPointerUp','onPointerCancel','onWheelCapture','onKeyDownCapture'])tree.props[key](event());
  expect(begin).not.toHaveBeenCalled();expect(finish).not.toHaveBeenCalled();expect(flush).not.toHaveBeenCalled();
  dismiss.props.onClick();tree=render();expect(find(tree,node=>node.props.className==='drawing-command-message')).toBeNull();
 }finally{cleanup();}
});
