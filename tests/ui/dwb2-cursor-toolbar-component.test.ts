import {beforeEach,describe,expect,it,vi} from 'vitest';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {CURSOR_PATCH_ABSENT} from '../../src/chart/cursor-kind';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';

// (root drop-in, needs the proposed catalog / toolbar model / DrawingToolbar diffs): the Cursors flyout chooses a cursor kind.
// Same controlled hook model as tests/ui/drawing-toolbar.test.ts; no DOM or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const find=(node:any,predicate:(node:any)=>boolean)=>findAll(node,predicate)[0]??null;
const catalog=drawingCatalog();
function toolbar(overrides:Record<string,unknown>={}){
 const props:any={chart:{drawingCatalog:()=>catalog},activeTool:null,activeMode:null,onSelect:vi.fn(),onCursor:vi.fn(),onOpenAll:vi.fn(),...overrides};
 const render=()=>{hooks.cursor=0;return DrawingToolbar(props);};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&node.props['aria-label']===label);
 const open=(groupLabel:string)=>{button('Open '+groupLabel).props.onClick();return render();};
 const item=(id:string)=>find(render(),node=>node.props['data-requirement']===id);
 return{props,render,button,open,item};
}

describe('Cursors flyout and cursor kinds ',()=>{
 it('without a cursor-kind host the Dot and Arrow rows stay unavailable and arm nothing',()=>{
  const t=toolbar();t.open('Cursors');
  for(const id of ['DW.CURSOR.DOT','DW.CURSOR.ARROW_CURSOR']){
   expect(t.item(id).props['aria-disabled']).toBe(true);
   t.item(id).props.onClick();
   expect(text(find(t.render(),node=>node.props.role==='status'))).toContain(CURSOR_PATCH_ABSENT);
  }
  expect(t.props.onCursor).not.toHaveBeenCalled();
 });
 it('choosing a kind reports it, then ends any drawing tool; the group button then names that kind',()=>{
  const onCursorKind=vi.fn(),t=toolbar({onCursorKind,activeCursor:'cross'});
  expect(t.button('Cursor')).not.toBeNull();
  t.open('Cursors');t.item('DW.CURSOR.DOT').props.onClick();
  expect(onCursorKind).toHaveBeenCalledTimes(1);expect(onCursorKind).toHaveBeenLastCalledWith('dot');expect(t.props.onCursor).toHaveBeenCalledTimes(1);
  expect(t.button('Dot')).not.toBeNull();expect(t.button('Cursor')).toBeNull();
  t.open('Cursors');t.item('DW.CURSOR.CROSS').props.onClick();
  expect(onCursorKind).toHaveBeenLastCalledWith('cross');expect(t.props.onCursor).toHaveBeenCalledTimes(2);
 });
 it('only the row of the chosen kind is checked; an armed drawing tool unchecks them all',()=>{
  const t=toolbar({onCursorKind:vi.fn(),activeCursor:'arrow'});t.open('Cursors');
  expect(t.item('DW.CURSOR.ARROW_CURSOR').props['aria-checked']).toBe(true);
  for(const id of ['DW.CURSOR.CROSS','DW.CURSOR.DOT'])expect(t.item(id).props['aria-checked'],id).toBe(false);
  t.props.activeTool='ray';
  for(const id of ['DW.CURSOR.CROSS','DW.CURSOR.DOT','DW.CURSOR.ARROW_CURSOR'])expect(t.item(id).props['aria-checked'],id).toBe(false);
 });
 it('Demonstration is listed with a cursor-kind host and chooses its kind (was held on direction',()=>{
  const onCursorKind=vi.fn(),t=toolbar({onCursorKind,enabledCursorKinds:['cross','dot','arrow','demonstration']});t.open('Cursors');
  expect(t.item('DW.CURSOR.DEMONSTRATION')).not.toBeNull();expect(t.item('DW.CURSOR.DEMONSTRATION').props['aria-disabled']).toBeUndefined();
  t.item('DW.CURSOR.DEMONSTRATION').props.onClick();
  expect(onCursorKind).toHaveBeenCalledWith('demonstration');expect(t.props.onCursor).toHaveBeenCalled();
 });
 it('a host that connects only some kinds leaves the others unavailable',()=>{
  const onCursorKind=vi.fn(),t=toolbar({onCursorKind,enabledCursorKinds:['arrow']});t.open('Cursors');
  expect(t.item('DW.CURSOR.ARROW_CURSOR').props['aria-disabled']).toBeUndefined();
  expect(t.item('DW.CURSOR.DOT').props['aria-disabled']).toBe(true);
  t.item('DW.CURSOR.DOT').props.onClick();expect(onCursorKind).not.toHaveBeenCalled();
 });
});
