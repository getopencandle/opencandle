import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NotesDialog} from '../../src/ui/NotesDialog';
import {createWatchBook,restoreWatchBook,type WatchBook} from '../../src/watchlists/model';
import {addWatchNote,type NoteMarket} from '../../src/watchlists/notes';
// Actual component handlers with a controlled hook lifecycle; no DOM or native UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,effects:[] as Array<{setup:()=>void|(()=>void);cleanup?:()=>void}>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
  useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
  useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
  useEffect:(setup:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=setup();hooks.effects.push({setup,cleanup:typeof cleanup==='function'?cleanup:undefined});}}
};});
const market:NoteMarket={exchange:'NYSE',symbol:'GME',synthetic:false};
const label=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(label).join(''):node?.props?label(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function setup(){
  const notes=addWatchNote(addWatchNote(addWatchNote([],'gme',market,'GME original',100),'spy',{...market,symbol:'SPY'},'SPY original',101),'amd',{...market,symbol:'AMD'},'AMD original',102);
  let book=restoreWatchBook({...createWatchBook(),notes});const onClose=vi.fn(),onChange=vi.fn((next:WatchBook,expected:WatchBook):boolean=>{expect(expected).toBe(book);book=next;return true;});
  const render=()=>{hooks.cursor=0;return NotesDialog({book,initialMarket:market,onClose,onChange});};
  const button=(name:string)=>{const node=find(render(),node=>node.type==='button'&&label(node)===name);if(!node)throw new Error('Missing reviewer control '+name);return node.props.onClick;};
  const input=(text:string)=>find(render(),node=>node.type==='textarea').props.onChange({target:{value:text}});
  const value=()=>find(render(),node=>node.type==='textarea').props.value;
  return{render,button,input,value,onChange,onClose,book:()=>book,replace:(next:WatchBook)=>{book=next;}};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.effects=[];});afterEach(()=>{for(const effect of hooks.effects)effect.cleanup?.();});

it('revokes a captured delete confirmation synchronously when deletion is cancelled',()=>{
  const ui=setup();ui.button('Delete note')();const confirm=ui.button('Confirm deletion');ui.button('Cancel deletion')();confirm();
  expect(ui.onChange).not.toHaveBeenCalled();expect(ui.book().notes!.find(note=>note.id==='gme')!.text).toBe('GME original');
});
it('revokes retained dirty-navigation discard and save handlers after Keep editing',()=>{
  const ui=setup();ui.button('All notes')();ui.input('Unsaved draft');ui.button('NYSE:SPY (1)')();
  const discard=ui.button('Discard draft'),save=ui.button('Save and continue');ui.button('Keep editing')();discard();save();
  expect(ui.value()).toBe('Unsaved draft');expect(ui.onChange).not.toHaveBeenCalled();
});
it('an older pending destination cannot replace the currently reviewed destination',()=>{
  const ui=setup();ui.button('All notes')();ui.input('Unsaved draft');ui.button('NYSE:SPY (1)')();const oldDiscard=ui.button('Discard draft');
  ui.button('NYSE:AMD (1)')();oldDiscard();expect(ui.value()).toBe('Unsaved draft');
  ui.button('Discard draft')();expect(ui.value()).toBe('AMD original');expect(ui.onChange).not.toHaveBeenCalled();
});
it('captured cancellation handlers after Close do not update retired dialog state',()=>{
  const ui=setup();ui.button('Delete note')();const cancel=ui.button('Cancel deletion');ui.button('Cancel / Close')();const writes=hooks.writes;
  cancel();expect(hooks.writes).toBe(writes);expect(ui.onClose).toHaveBeenCalledOnce();expect(ui.onChange).not.toHaveBeenCalled();
});
it('editing the draft retires earlier navigation and deletion confirmation handlers',()=>{
  const ui=setup();ui.button('All notes')();ui.input('First draft');ui.button('NYSE:SPY (1)')();const continueOld=ui.button('Save and continue');
  ui.input('Newer draft');continueOld();expect(ui.onChange).not.toHaveBeenCalled();expect(ui.value()).toBe('Newer draft');
  ui.button('Delete note')();const deleteOld=ui.button('Confirm deletion');ui.input('Latest draft');deleteOld();
  expect(ui.onChange).not.toHaveBeenCalled();expect(ui.value()).toBe('Latest draft');expect(ui.book().notes).toHaveLength(3);
});
it('publication that synchronously closes the owner does not write retired editor state',()=>{
  const ui=setup();ui.input('Accepted once');const close=ui.button('Cancel / Close');let writesAfterClose=0;
  ui.onChange.mockImplementationOnce(()=>{close();writesAfterClose=hooks.writes;return true;});ui.button('Save note')();
  expect(ui.onChange).toHaveBeenCalledOnce();expect(ui.onClose).toHaveBeenCalledOnce();expect(hooks.writes).toBe(writesAfterClose);
});
it('StrictMode-style effect cleanup and replay keeps the live editor usable and final cleanup retires it',()=>{
  const ui=setup();ui.render();for(const effect of hooks.effects){effect.cleanup?.();const cleanup=effect.setup();effect.cleanup=typeof cleanup==='function'?cleanup:undefined;}
  ui.input('Edited after effect replay');const save=ui.button('Save note');save();save();expect(ui.onChange).toHaveBeenCalledOnce();
  for(const effect of hooks.effects)effect.cleanup?.();const writes=hooks.writes;save();expect(hooks.writes).toBe(writes);expect(ui.onChange).toHaveBeenCalledOnce();
});
it('rejected or throwing deletion preserves the saved note and current confirmation',()=>{
  const ui=setup(),before=JSON.stringify(ui.book());ui.button('Delete note')();ui.onChange.mockReturnValueOnce(false);ui.button('Confirm deletion')();
  expect(JSON.stringify(ui.book())).toBe(before);expect(label(ui.render())).toMatch(/rejected/i);expect(ui.button('Confirm deletion')).toBeTypeOf('function');
  ui.onChange.mockImplementationOnce(()=>{throw new Error('Synthetic publication failure');});ui.button('Confirm deletion')();
  expect(JSON.stringify(ui.book())).toBe(before);expect(label(ui.render())).toContain('Synthetic publication failure');
});
it('stale-owner edit retains literal draft and never publishes to a replacement book',()=>{
  const ui=setup();ui.input('<script>literal draft only</script>\nNext line');const save=ui.button('Save note');ui.replace(restoreWatchBook({...ui.book(),lastFlag:'blue'}));ui.render();save();
  expect(ui.onChange).not.toHaveBeenCalled();expect(ui.value()).toBe('<script>literal draft only</script>\nNext line');expect(label(ui.render())).toMatch(/changed/i);
});
