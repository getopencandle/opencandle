import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScreenerDialog} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings} from '../../src/domain/screener-state';
import {fixtureDataset} from '../../src/domain/fixtures';
// Actual returned handlers with controlled hooks, not DOM/context-menu/native verification.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),
 useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){old?.cleanup?.();const cleanup=effect();hooks.cells[i]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}}
};});
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function setup(){const props={datasets:[fixtureDataset('GME',5),fixtureDataset('SPY',5)],settings:createScreenerSettings(),onNotes:vi.fn(()=>true),onChange:vi.fn(),onClose:vi.fn(),onSelect:vi.fn()};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const row=(symbol:string)=>find(render(),node=>node.type==='tr'&&node.props.onContextMenu&&text(node).includes('Open '+symbol)).props;
 const button=(name:string)=>{const node=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!node)throw new Error('Missing note route control '+name);return node.props.onClick;};
 return{props,render,row,button};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];});afterEach(()=>hooks.cleanups.forEach(cleanup=>cleanup()));
it('Close and Escape revoke captured context note actions while the direct action stays available',()=>{
 const ui=setup();ui.row('GME').onContextMenu({preventDefault:vi.fn()});const old=ui.button('Add local symbol note');ui.button('Close row actions')();old();expect(ui.props.onNotes).not.toHaveBeenCalled();
 ui.row('GME').onContextMenu({preventDefault:vi.fn()});const escaped=ui.button('Add local symbol note');find(ui.render(),node=>node.props['aria-label']==='Screener row actions').props.onKeyDown({key:'Escape',stopPropagation:vi.fn()});escaped();expect(ui.props.onNotes).not.toHaveBeenCalled();
 ui.button('Add note for SYNTHETIC:GME')();expect(ui.props.onNotes).toHaveBeenCalledWith({exchange:'SYNTHETIC',symbol:'GME',synthetic:true});expect(ui.props.onSelect).not.toHaveBeenCalled();
});
it('a replacement row context retires the earlier row action and emits only current market identity',()=>{
 const ui=setup();ui.row('GME').onContextMenu({preventDefault:vi.fn()});const old=ui.button('Add local symbol note');ui.row('SPY').onContextMenu({preventDefault:vi.fn()});old();expect(ui.props.onNotes).not.toHaveBeenCalled();
 const current=ui.button('Add local symbol note');current();current();expect(ui.props.onNotes).toHaveBeenCalledOnce();expect(ui.props.onNotes).toHaveBeenCalledWith({exchange:'SYNTHETIC',symbol:'SPY',synthetic:true});
});
it('captured context rejects replacement source arrays and in-place market identity mutation',()=>{
 const ui=setup();ui.row('GME').onContextMenu({preventDefault:vi.fn()});const old=ui.button('Add local symbol note');ui.props.datasets=[...ui.props.datasets];ui.render();old();expect(ui.props.onNotes).not.toHaveBeenCalled();
 ui.row('GME').onContextMenu({preventDefault:vi.fn()});const corrected=ui.button('Add local symbol note');ui.props.datasets[0].instrument.symbol='CHANGED';corrected();expect(ui.props.onNotes).not.toHaveBeenCalled();
});
it('dialog Close and final effect cleanup prevent retained context from reopening another dialog',()=>{
 const ui=setup();ui.row('GME').onContextMenu({preventDefault:vi.fn()});const old=ui.button('Add local symbol note');ui.button('Close')();hooks.cleanups.forEach(cleanup=>cleanup());old();expect(ui.props.onNotes).not.toHaveBeenCalled();expect(ui.props.onClose).toHaveBeenCalledOnce();
});
