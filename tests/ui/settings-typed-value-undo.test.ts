import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {findAll,makeHarness} from './indicator-real-port-harness';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// A typed settings value is one edit: the transient keystrokes ("1" on the way to "14") never reach the chart, so the
// workspace capture records one undo step and that step returns the previously committed value.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();hooks.cells=[];hooks.cursor=0;vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});
type Snapshot={inputs:Record<string,unknown>;visible:boolean};

/** The compact window on the real port, with a history that records one entry per native change (as the cell capture does). */
function compact(kind:'sma'|'hma'){
 const ui=dialog({seed:[kind],initialSelected:0});ui.props.compact=true;
 const history=createWorkspaceHistory<Snapshot>(),port=ui.port,update=port.update.bind(port);
 const snap=():Snapshot=>{const row=port.list()[0];return {inputs:structuredClone(row.inputs) as Record<string,unknown>,visible:row.visible};};
 port.update=((id:string,patch:any)=>{const before=snap(),result=update(id,patch);if(JSON.stringify(before)!==JSON.stringify(snap()))history.record(before,null);return result;}) as typeof port.update;
 /** Each keystroke: the browser input event (insertText) reaches the form first, then the field's change. */
 const type=(label:string,text:string)=>{for(let i=1;i<=text.length;i++){ui.sForm().props.onInputCapture({target:{tagName:'INPUT',type:ui.sField(label).props.type},nativeEvent:{inputType:'insertText'}});ui.sEdit(label,text.slice(0,i));}};
 const blur=()=>ui.sForm().props.onBlurCapture();
 const undo=()=>history.undo(snap(),null)!.workspace;
 return {ui,history,snap,type,blur,undo};
}

it('typing 14 into a Length showing 9 is one undo step that returns 9',()=>{
 const {ui,history,type,blur,undo}=compact('sma');
 expect(ui.port.list()[0].inputs.length).toBe(9);
 type('Length','14');
 expect(ui.port.list()[0].inputs.length).toBe(9);
 blur();
 expect(ui.port.list()[0].inputs.length).toBe(14);
 expect(history.status().undo).toBe(1);
 expect(undo().inputs.length).toBe(9);
});
it('a typed value previews after a short pause, still as one step',()=>{
 const {ui,history,type,undo}=compact('hma'),before=ui.port.list()[0].inputs.length;
 type('Length','20');
 vi.advanceTimersByTime(1000);
 expect(ui.port.list()[0].inputs.length).toBe(20);
 expect(history.status().undo).toBe(1);
 expect(undo().inputs.length).toBe(before);
});
it('Enter commits the typed value, and an invalid transient value is never applied',()=>{
 const {ui,history,type,blur}=compact('sma');
 type('Length','0');blur();vi.advanceTimersByTime(1000);
 expect(ui.port.list()[0].inputs.length).toBe(9);expect(history.status().undo).toBe(0);
 ui.sEdit('Length','');blur();
 expect(ui.port.list()[0].inputs.length).toBe(9);expect(history.status().undo).toBe(0);
 type('Length','30');ui.sForm().props.onKeyDownCapture({key:'Enter'});
 expect(ui.port.list()[0].inputs.length).toBe(30);expect(history.status().undo).toBe(1);
});
it('an arrow step (an input event without inputType) previews at once, one step each',()=>{
 const {ui,history}=compact('sma');
 ui.sForm().props.onInputCapture({target:{tagName:'INPUT',type:'number'},nativeEvent:{}});ui.sEdit('Length','10');
 expect(ui.port.list()[0].inputs.length).toBe(10);
 ui.sForm().props.onInputCapture({target:{tagName:'INPUT',type:'number'},nativeEvent:{}});ui.sEdit('Length','11');
 expect(history.status().undo).toBe(2);
});
it('Cancel drops a pending typed value and restores the original',()=>{
 const {ui,type}=compact('sma');
 type('Length','14');ui.sClick('Cancel');vi.advanceTimersByTime(1000);
 expect(ui.port.list()[0].inputs.length).toBe(9);
});
it('checkbox edits are still one undo step each',()=>{
 const {ui,history,undo}=compact('sma');
 ui.sClick('Style');
 const box=()=>findAll(ui.sForm(),node=>node.type==='input'&&node.props.type==='checkbox')[0];
 const toggle=(checked:boolean)=>{ui.sForm().props.onInputCapture({target:{tagName:'INPUT',type:'checkbox'},nativeEvent:{}});box().props.onChange({target:{checked}});};
 toggle(false);expect(history.status().undo).toBe(1);
 toggle(true);expect(history.status().undo).toBe(2);
 expect(Object.values(undo().inputs).length).toBeGreaterThan(0);expect(history.status().undo).toBe(1);
});

function drawingFixture(){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 let record=createDrawing('trendline',{id:'line',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}]})!.serialize();
 const history=createWorkspaceHistory<{record:unknown}>();
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{const before=structuredClone(record);record=patchDrawingEdit(record,bars,patch,coordinates,offset);history.record({record:before},null);return {accepted:true};});
 const previewDrawingEdit=vi.fn(),clearDrawingPreview=vi.fn();
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update,previewDrawingEdit,clearDrawingPreview};
 const props:any={chart,id:'line',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const find=(node:any,predicate:(node:any)=>boolean):any=>{if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}return null;}if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 return {update,previewDrawingEdit,history,record:()=>record,field:(path:string)=>find(render(),node=>node.props['data-property']===path),form:()=>find(render(),node=>node.type==='form')};
}
it('a typed drawing setting previews only and Apply records one undo step returning the previous value',()=>{
 const ui=drawingFixture(),width=ui.record().style.lineWidth;
 ui.field('style.lineWidth').props.onChange({target:{value:''}});ui.field('style.lineWidth').props.onChange({target:{value:'3'}});
 expect(ui.update).not.toHaveBeenCalled();expect(ui.history.status().undo).toBe(0);
 ui.form().props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
 expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.record().style.lineWidth).toBe(3);
 expect((ui.history.undo({record:ui.record()},null)!.workspace.record as any).style.lineWidth).toBe(width);
});
