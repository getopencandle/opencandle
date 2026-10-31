import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setup,focusDocument,invoke,input} from '../helpers/alert-dialog-harness';

// `escape-priority-menu-preview-selection-then-dialog`
// and ALERT.MESSAGE (`message-output-is-bounded-to-4000-characters`). Actual AlertDialog callbacks under the shared
// controlled hook and node model. A key reaches the dialog only while focus is inside it (bubbling model); Chromium's
// focus fixup (a focused control that becomes disabled loses focus to the body) is applied explicitly; MutationObserver
// delivery is driven by the test. No browser DOM, focus engine, GUI or package claim.

const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});

type UI=ReturnType<typeof setup>;
const dialogNode=(ui:UI)=>ui.nodeFor(ui.find(node=>node.props.role==='dialog'));
/** Chromium after a commit: a focused control that became disabled loses focus to the body; observers then run. */
function commit(ui:UI){const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();vi.advanceTimersByTime(0);}
function press(ui:UI,key:string){
 const control=ui.find(node=>node.props.role==='dialog'),dialog=ui.nodeFor(control),target=focusDocument.activeElement;
 if(!target||!dialog.contains(target))return false;// a keydown on the body never reaches the dialog
 invoke(control.props.onKeyDown,input(dialog,{key,target}));ui.settle();commit(ui);return true;
}
const count=(ui:UI)=>{const node=ui.find(element=>element.props['aria-label']==='Selected alert count');return String((node.props.children as unknown[]).join(''));};

it('CLEAR_SELECTION_BUTTON: Escape cancels the preview, then clears the selection, then closes the dialog',()=>{
 const ui=setup(),before=ui.props.alerts;
 ui.toggle('a');ui.toggle('b');expect(count(ui)).toBe('2 selected');
 ui.callButton('Pause selected');commit(ui);
 expect(ui.text()).toContain('Apply pause');
 expect(press(ui,'Escape')).toBe(true);
 expect(ui.text()).not.toContain('Apply pause');expect(count(ui)).toBe('2 selected');expect(ui.props.onClose).not.toHaveBeenCalled();
 expect(press(ui,'Escape')).toBe(true);
 expect(count(ui)).toBe('0 selected');expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.props.alerts).toBe(before);
 // The control that had focus (the trigger of the cancelled preview) is now disabled: focus stays inside the dialog.
 expect(focusDocument.activeElement===focusDocument.body).toBe(false);
 expect(dialogNode(ui).contains(focusDocument.activeElement)).toBe(true);
 expect((focusDocument.activeElement as {disabled?:boolean}).disabled).toBe(false);
 expect(press(ui,'Escape')).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
 expect(ui.publish).not.toHaveBeenCalled();
});

it('CLEAR_SELECTION_BUTTON: Clear selection by keyboard (Space on the button) keeps focus inside, so Escape closes',()=>{
 const ui=setup();ui.toggle('a');ui.callButton('Clear selection');commit(ui);
 expect(count(ui)).toBe('0 selected');
 expect(dialogNode(ui).contains(focusDocument.activeElement)).toBe(true);
 expect(press(ui,'Escape')).toBe(true);expect(ui.props.onClose).toHaveBeenCalledOnce();
});

it('ALERT.MESSAGE: a 1704-character template is kept whole (limit 4000, as the record specifies); 4001 is refused',()=>{
 const ui=setup(),template='{{time}}'.repeat(213);expect(template.length).toBe(1704);
 ui.callButton('Create alert');
 const field=ui.field('Alert message');expect(field.type).toBe('textarea');expect(field.props.maxLength).toBe(4000);
 ui.change('Alert message',template);expect(ui.field('Alert message').props.value).toBe(template);
 ui.change('Alert message','x'.repeat(4000));expect((ui.field('Alert message').props.value as string).length).toBe(4000);
});
