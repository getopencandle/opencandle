import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {makeHarness} from './indicator-real-port-harness';
import {createWorkspaceHistory,openHistorySession} from '../../src/ui/workspace-history';
import type {ChartWorkspace} from '../../src/ui/workspace-grid';

// The compact Settings window previews on the chart, and the cell capture records each preview as a step. Cancel and Esc
// leave Undo exactly as it was before the window opened; Ok leaves one step for the net change.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();hooks.cells=[];hooks.cursor=0;vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});
type Snapshot={length:unknown};
const changed=(a:Snapshot,b:Snapshot)=>JSON.stringify(a)!==JSON.stringify(b);

/** The compact window on the real port; every native change records a step, as the cell capture does. */
function compact(earlier:number[]=[]){
 const ui=dialog({seed:['rsi'],initialSelected:0});ui.props.compact=true;
 const history=createWorkspaceHistory<Snapshot>(),port=ui.port,update=port.update.bind(port);
 const snap=():Snapshot=>({length:port.list()[0].inputs.length});
 port.update=((id:string,patch:any)=>{const before=snap(),result=update(id,patch);if(changed(before,snap()))history.record(before,null);return result;}) as typeof port.update;
 for(const value of earlier)port.update(port.list()[0].id,{inputs:{...port.list()[0].inputs,length:value}});
 ui.props.historySession=()=>{const mark=history.mark(snap(),null);return {settle:()=>mark.settle(snap(),changed)};};
 const type=(label:string,text:string)=>{for(let i=1;i<=text.length;i++){ui.sForm().props.onInputCapture({target:{tagName:'INPUT',type:'number'},nativeEvent:{inputType:'insertText'}});ui.sEdit(label,text.slice(0,i));}};
 const enter=()=>ui.sForm().props.onKeyDownCapture({key:'Enter'});
 /** Restores a history entry on the chart without recording, as Undo does. */
 const restore=(value:unknown)=>update(port.list()[0].id,{inputs:{...port.list()[0].inputs,length:value}});
 const undo=()=>{const entry=history.undo(snap(),null);if(entry)restore(entry.workspace.length);return entry;};
 const length=()=>port.list()[0].inputs.length;
 return {ui,history,type,enter,undo,length};
}

it('Esc after a committed typed preview leaves no undo step to bring the cancelled value back',()=>{
 const {ui,history,type,enter,undo,length}=compact([21]);
 expect(history.status().undo).toBe(1);
 type('Length','25');enter();expect(length()).toBe(25);
 ui.render().props.onClose();
 expect(length()).toBe(21);expect(history.status()).toMatchObject({undo:1,redo:0});
 undo();expect(length()).toBe(14);
});
it('Cancel after several previews restores the history, including its redo steps',()=>{
 const {ui,history,type,enter,undo,length}=compact([21,30]);
 undo();expect(length()).toBe(21);
 const before=history.status();expect(before).toMatchObject({undo:1,redo:1});
 type('Length','25');enter();type('Length','40');vi.advanceTimersByTime(1000);expect(length()).toBe(40);
 ui.sClick('Cancel');
 expect(length()).toBe(21);expect(history.status()).toEqual(before);
});
it('Ok records exactly one step for the net change',()=>{
 const {ui,history,type,enter,undo,length}=compact([21]);
 type('Length','25');enter();type('Length','28');enter();expect(history.status().undo).toBe(3);
 ui.sSubmit();
 expect(length()).toBe(28);expect(history.status()).toMatchObject({undo:2,redo:0});
 undo();expect(length()).toBe(21);
});
it('Ok with no net change records nothing',()=>{
 const {ui,history,type,enter}=compact([21]);
 type('Length','25');enter();type('Length','21');enter();
 ui.sSubmit();
 expect(history.status().undo).toBe(1);
});
it('an Undo taken while the session is open keeps the history as it is',()=>{
 const history=createWorkspaceHistory<Snapshot>();history.record({length:1},null);
 const mark=history.mark({length:2},null);history.record({length:2},null);history.undo({length:3},null);
 expect(mark.settle({length:2},changed)).toBe(false);expect(history.status()).toMatchObject({undo:1,redo:1});
});
it('a session settles only on the history it opened with',()=>{
 type Plain=ChartWorkspace&Record<string,unknown>;
 const ref={current:createWorkspaceHistory<Plain>()},none={} as Plain,read=()=>({workspace:none,replay:null});
 ref.current.record(none,null);const session=openHistorySession(ref,read);ref.current.record(none,null);
 const replaced=ref.current;ref.current=createWorkspaceHistory<Plain>();
 expect(session.settle()).toBe(false);expect(replaced.status().undo).toBe(2);
 ref.current=replaced;const next=openHistorySession(ref,read);ref.current.record(none,null);
 expect(next.settle()).toBe(true);expect(replaced.status().undo).toBe(2);
});
