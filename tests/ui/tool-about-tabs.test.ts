import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {ToolAbout,ToolAboutDialog} from '../../src/ui/ToolAbout';

// The About tab of the indicator settings and the picker's info buttons, over the real indicator port. Every indicator
// has a reference file today, so SMA's file is hidden here to stand for an indicator without one.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
vi.mock('../../src/ui/tool-reference',async()=>{const actual=await vi.importActual<any>('../../src/ui/tool-reference');return {...actual,referenceFileFor:(id:string)=>id==='sma'?null:actual.referenceFileFor(id)};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const tabNames=(tree:any)=>findAll(find(tree,node=>node.type==='nav'&&node.props.className==='tab-row').props.children,node=>node.type==='button').map(text);

describe('tool About in the indicator dialog',()=>{
 it('the settings get an About tab for an indicator with a reference file, showing its About',()=>{
  const ui=dialog({seed:['rsi'],initialSelected:0});
  expect(tabNames(ui.sForm())).toEqual(['Inputs','Style','Visibility','Placement','About']);
  ui.sClick('About');
  const about=find(ui.sForm(),node=>node.type===ToolAbout);
  expect(about.props.file).toBe('rsi');
 });
 it('an indicator without a reference file has no About tab',()=>{
  const ui=dialog({seed:['sma'],initialSelected:0});
  expect(tabNames(ui.sForm())).toEqual(['Inputs','Style','Visibility','Placement']);
  expect(findAll(ui.sForm(),node=>node.type===ToolAbout)).toEqual([]);
 });
 it('picker rows carry an info button that opens the About dialog; rows without a file have none',()=>{
  const ui=dialog();
  expect(findAll(ui.render(),node=>node.props?.['aria-label']==='About Simple Moving Average (SMA)')).toEqual([]);
  const info=find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='About Relative Strength Index (RSI)');
  expect(info.props.tabIndex).toBe(-1);expect(info.props['aria-keyshortcuts']).toBe('Control+I');
  expect(findAll(ui.render(),node=>node.type===ToolAboutDialog)).toEqual([]);
  info.props.onClick();
  const opened=find(ui.render(),node=>node.type===ToolAboutDialog);
  expect(opened.props).toMatchObject({file:'rsi',title:'Relative Strength Index (RSI)'});
  opened.props.onClose();
  expect(findAll(ui.render(),node=>node.type===ToolAboutDialog)).toEqual([]);
 });
 it('Ctrl+I in the search box opens the About of the highlighted row',()=>{
  const ui=dialog(),search=()=>find(ui.render(),node=>node.props?.['aria-label']==='Search indicators');
  search().props.onChange({target:{value:'Relative Strength Index'}});
  search().props.onKeyDown({key:'ArrowDown',preventDefault(){}});
  const prevented=vi.fn();search().props.onKeyDown({key:'i',ctrlKey:true,preventDefault:prevented});
  expect(prevented).toHaveBeenCalled();
  expect(find(ui.render(),node=>node.type===ToolAboutDialog).props.file).toBe('rsi');
 });
});
