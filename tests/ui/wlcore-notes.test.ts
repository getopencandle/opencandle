import {beforeEach,expect,it,vi} from 'vitest';
import {NotesDialog} from '../../src/ui/NotesDialog';
import {createWatchBook,restoreWatchBook,type WatchBook} from '../../src/watchlists/model';
import {notesForMarket,type NoteMarket} from '../../src/watchlists/notes';

// Create, edit and revisit a local plain-text note bound to the market; Cancel writes nothing.
// Actual component handlers with controlled React state. No native or DOM verification.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;}};});
const market:NoteMarket={exchange:'NYSE',symbol:'GME',synthetic:false};
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function setup(book:WatchBook,startNew:boolean){
 let accepted=book;const changes:WatchBook[]=[],close=vi.fn();hooks.cells=[];hooks.cursor=0;
 const render=()=>{hooks.cursor=0;return NotesDialog({book:accepted,initialMarket:market,startNew,onChange:(next,expected)=>{expect(expected).toBe(accepted);changes.push(next);accepted=next;return true;},onClose:close});};
 const button=(name:string)=>{const node=find(render(),candidate=>candidate.type==='button'&&text(candidate)===name);if(!node)throw Error('Missing '+name);return node.props;};
 const input=(value:string)=>find(render(),node=>node.type==='textarea').props.onChange({target:{value}});
 return{render,button,input,changes,close,book:()=>accepted};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
it('creates a note for the market, revisits it after a restart, edits it, and Cancel writes nothing',()=>{
 const created=setup(createWatchBook([]),true);created.input('First thought');created.button('Add note locally').onClick();
 expect(created.changes).toHaveLength(1);const saved=created.book();expect(notesForMarket(saved.notes!,market).map(note=>[note.text,note.revision])).toEqual([['First thought',1]]);
 expect(notesForMarket(saved.notes!,{...market,symbol:'SPY'})).toEqual([]);expect(notesForMarket(saved.notes!,{...market,synthetic:true})).toEqual([]);expect(notesForMarket(saved.notes!,{...market,exchange:'NASDAQ'})).toEqual([]);
 const restarted=restoreWatchBook(JSON.parse(JSON.stringify(saved))),revisit=setup(restarted,false);expect(text(revisit.render())).toContain('First thought');
 revisit.input('Edited thought');revisit.button('Save note').onClick();expect(revisit.changes).toHaveLength(1);
 const edited=notesForMarket(revisit.book().notes!,market);expect(edited.map(note=>[note.text,note.revision])).toEqual([['Edited thought',2]]);expect(edited[0].updatedAt).toBeGreaterThanOrEqual(edited[0].createdAt);
 const cancelled=setup(revisit.book(),false);cancelled.input('Discarded draft');cancelled.button('Cancel / Close').onClick();expect(cancelled.changes).toEqual([]);expect(cancelled.close).toHaveBeenCalledOnce();expect(JSON.stringify(cancelled.book())).toBe(JSON.stringify(revisit.book()));
});
