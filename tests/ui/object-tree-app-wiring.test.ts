import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';

// Multi-removal wiring: the mounted App hands the Object tree BOTH host routes, so the shipped multi-select Delete is the
// batch route (one undo step, tests/ui/object-tree-app-removal.test.ts) rather than one removal per indicator. Actual
// App closures with controlled React scheduling; not a DOM, native-window or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},
  useLayoutEffect:()=>{}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node)){for(const child of node)findAll(child,test,out);}
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>vi.unstubAllGlobals());
async function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const button=(name:string)=>{const rows=findAll(render(),row=>row.type==='button'&&(row.props['aria-label']===name||content(row)===name));if(rows.length!==1)throw Error('Expected one App button '+name+', found '+rows.length);return rows[0];};
 const widget=()=>find(render(),row=>row.type===ObjectTreeDataWindowWidget);
 return{render,button,widget,host:()=>find(render(),row=>row.type===WorkspaceChartHost)};
}

it('the mounted App passes the Object tree onRemoveObjects beside onIndicatorAction and onIndicatorMove',async()=>{
 const ui=await setup();ui.button('Object tree and data window').props.onClick();
 const tree=ui.widget().props.objectTree;
 expect(tree.onRemoveObjects).toBeTypeOf('function');expect(tree.onIndicatorAction).toBeTypeOf('function');expect(tree.onIndicatorMove).toBeTypeOf('function');
});
it('the App route is the guarded one: with no rendered analysis chart it neither removes drawings nor raises',async()=>{
 const ui=await setup();ui.button('Object tree and data window').props.onClick();
 const tree=ui.widget().props.objectTree,removeDrawings=vi.fn(),remove=vi.fn(),beginExternalTransaction=vi.fn();
 expect(()=>tree.onRemoveObjects({indicators:[{id:'x'}],drawingIds:['d1'],removeDrawings})).not.toThrow();
 expect(removeDrawings).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(beginExternalTransaction).not.toHaveBeenCalled();
});
it('with a ready chart whose input is not current the App route refuses before touching the indicator port',async()=>{
 const ui=await setup();
 const port={list:vi.fn(()=>[{id:'x',kind:'sma',inputs:{},visible:true}]),remove:vi.fn(),beginExternalTransaction:vi.fn(),subscribe:vi.fn(()=>()=>{}),serialize:vi.fn(()=>[])};
 const controller:any={drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},indicators:port,isInputCurrent:()=>false};
 ui.host().props.onReady(controller);ui.render();ui.button('Object tree and data window').props.onClick();
 const removeDrawings=vi.fn();ui.widget().props.objectTree.onRemoveObjects({indicators:[{id:'x',kind:'sma',inputs:{},visible:true}],drawingIds:['d1'],removeDrawings});
 expect(port.beginExternalTransaction).not.toHaveBeenCalled();expect(port.remove).not.toHaveBeenCalled();expect(removeDrawings).not.toHaveBeenCalled();
});
