import {afterEach,expect,it,vi} from 'vitest';
import {all,invoke,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {CompoundConditionEditor,type CompoundConditionDraft,type CompoundConditionChoice} from '../../src/ui/CompoundConditionEditor';
import {Modal} from '../../src/ui/Modal';

// Actual component hooks/callbacks with the existing controlled React/node
// model. Modal is retained as the real child component but is not expanded by
// this model. Native focus, key dispatch and portal nesting are separate DOM
// DOM acceptance items; these cases claim none of them.
const mounted:Array<{dispose():void}>=[];
afterEach(()=>{for(const ui of mounted.splice(0))ui.dispose();});
function rows(count=2):readonly CompoundConditionDraft[]{return Object.freeze(Array.from({length:count},(_,index)=>Object.freeze({id:'SYNTHETIC private row '+index,sourceId:'SYNTHETIC private source',kind:'greater' as const,value:String(10+index),lower:'',upper:''})));}
function fixture(initial=rows()){
 let ready=true;
 const owner={assertCurrent:vi.fn(()=>{if(!ready)throw Error('SYNTHETIC editor retired.');})};
 const props={conditions:initial,choices:[{id:'SYNTHETIC private source',label:'SYNTHETIC Close'},{id:'SYNTHETIC other source',label:'SYNTHETIC SMA 3'}] as CompoundConditionChoice[],owner,onError:vi.fn<(message:string)=>void>(),onChange:vi.fn<(next:readonly CompoundConditionDraft[],expected:readonly CompoundConditionDraft[])=>boolean|void>()};
 props.onChange.mockImplementation((next,expected)=>{if(expected!==props.conditions)return false;props.conditions=next;return true;});
 const ui=mountControlledComponent(()=>CompoundConditionEditor(props));mounted.push(ui);ui.settle();
 const button=(label:string)=>ui.find(node=>node.type==='button'&&text(node)===label);
 const click=(label:string)=>{invoke(button(label).props.onClick);ui.settle();};
 const control=(label:string)=>ui.find(node=>node.props['aria-label']===label);
 const fill=(label:string,value:string)=>{invoke(control(label).props.onChange,{target:{value}});ui.settle();};
 const open=(number=1)=>{invoke(ui.find(node=>node.type==='button'&&String(node.props['aria-label']).startsWith(`Edit condition ${number}:`)).props.onClick);ui.settle();};
 const dialogs=()=>all(ui.settle(),node=>node.type===Modal);
 const complete=()=>{fill('Condition source','SYNTHETIC private source');fill('Condition operator','greater');fill('Condition value','25');};
 return{ui,props,owner,button,click,control,fill,open,dialogs,complete,retire(){ready=false;}};
}
it('shows editable preview buttons without raw identities or inline editing fields',()=>{
 const f=fixture(),tree=f.ui.settle(),content=text(tree);
 expect(all(tree,node=>node.props['aria-haspopup']==='dialog')).toHaveLength(2);
 expect(content).toContain('SYNTHETIC Close · Greater than · 10');expect(content).not.toContain('private row');expect(content).not.toContain('private source');expect(content).not.toContain('—');
 expect(all(tree,node=>node.type==='input'||node.type==='select')).toHaveLength(0);expect(f.dialogs()).toHaveLength(0);expect(f.props.onChange).not.toHaveBeenCalled();
});
it('keeps editing local and Cancel discards it without publishing any rows',()=>{
 const f=fixture(),base=f.props.conditions;f.open();f.fill('Condition value','407');
 expect(f.control('Condition value').props.value).toBe('407');expect(f.props.conditions).toBe(base);expect(base[0].value).toBe('10');expect(f.props.onChange).not.toHaveBeenCalled();
 f.click('Cancel');expect(f.dialogs()).toHaveLength(0);f.open();expect(f.control('Condition value').props.value).toBe('10');
});
it('publishes one complete frozen collection with the exact expected base on Save',()=>{
 const f=fixture(),base=f.props.conditions;f.open();f.fill('Condition value','407');f.click('Save');
 expect(f.props.onChange).toHaveBeenCalledTimes(1);const [next,expected]=f.props.onChange.mock.calls[0];
 expect(expected).toBe(base);expect(next).toBe(f.props.conditions);expect(next).toHaveLength(2);expect(next[0]).toEqual({...base[0],value:'407'});expect(next[1]).toEqual(base[1]);expect(base[0].value).toBe('10');
 expect(Object.isFrozen(next)).toBe(true);expect(next.every(Object.isFrozen)).toBe(true);expect(f.dialogs()).toHaveLength(0);
});
it('opens Add with no inferred source, operator or zero and publishes only after completion',()=>{
 const f=fixture(),base=f.props.conditions;f.click('Add condition');
 expect(f.control('Condition source').props.value).toBe('');expect(f.control('Condition operator').props.value).toBe('');expect(f.control('Condition value').props.value).toBe('');
 f.click('Add');expect(f.props.onChange).not.toHaveBeenCalled();expect(f.props.conditions).toBe(base);expect(f.dialogs()).toHaveLength(1);
 f.complete();f.click('Add');expect(f.props.conditions).toHaveLength(3);expect(f.props.conditions[2]).toMatchObject({sourceId:'SYNTHETIC private source',kind:'greater',value:'25'});expect(f.props.conditions.slice(0,2)).toEqual(base);
});
it('enforces two to five conditions and refuses a saved Add callback after a replacement reaches five',()=>{
 const f=fixture();expect(f.ui.find(node=>node.props['aria-label']==='Remove condition 1').props.disabled).toBe(true);
 f.click('Add condition');f.complete();const stale=f.button('Add').props.onClick;f.props.conditions=rows(5);f.ui.settle();invoke(stale);f.ui.settle();
 expect(f.props.conditions).toHaveLength(5);expect(f.button('Add condition').props.disabled).toBe(true);expect(f.props.onChange).not.toHaveBeenCalled();expect(f.dialogs()).toHaveLength(0);
});
it('removes one current row with exact-base CAS and preserves the other declarations',()=>{
 const f=fixture(rows(3)),base=f.props.conditions;
 invoke(f.ui.find(node=>node.props['aria-label']==='Remove condition 2').props.onClick);f.ui.settle();
 expect(f.props.onChange).toHaveBeenCalledTimes(1);expect(f.props.onChange.mock.calls[0][1]).toBe(base);expect(f.props.conditions).toEqual([base[0],base[2]]);
});
it('preserves the local text draft across market-style rerenders and equivalent choice refreshes',()=>{
 const f=fixture();f.open();f.fill('Condition value','407');
 for(let tick=0;tick<5;tick++){f.props.choices=f.props.choices.map(choice=>({...choice}));f.ui.settle();}
 expect(f.control('Condition value').props.value).toBe('407');expect(f.dialogs()).toHaveLength(1);expect(f.props.onChange).not.toHaveBeenCalled();f.click('Save');expect(f.props.conditions[0].value).toBe('407');
});
it('drops a draft on editor-owner replacement and ignores its saved callbacks',()=>{
 const f=fixture();f.open();f.fill('Condition value','407');const stale=f.button('Save').props.onClick;
 f.props.owner={assertCurrent:vi.fn()};f.ui.settle();invoke(stale);f.ui.settle();
 expect(f.dialogs()).toHaveLength(0);expect(f.props.conditions[0].value).toBe('10');expect(f.props.onChange).not.toHaveBeenCalled();
});
it('refuses a retired editor before mutating local or controlled state',()=>{
 const f=fixture();f.open();f.fill('Condition value','407');f.retire();f.click('Save');
 expect(f.props.onChange).not.toHaveBeenCalled();expect(f.props.onError).toHaveBeenCalledWith('SYNTHETIC editor retired.');expect(f.props.conditions[0].value).toBe('10');
});
it('keeps a rejected CAS draft open for review and does not publish on Cancel',()=>{
 const f=fixture(),base=f.props.conditions;f.props.onChange.mockReturnValue(false);f.open();f.fill('Condition value','407');f.click('Save');
 expect(f.dialogs()).toHaveLength(1);expect(f.control('Condition value').props.value).toBe('407');expect(f.props.conditions).toBe(base);expect(f.props.onError).toHaveBeenCalledWith('The alert draft changed. Review it before editing again.');f.click('Cancel');expect(f.props.onChange).toHaveBeenCalledTimes(1);
});
it('contains a failing parent publication without closing or overwriting the draft',()=>{
 const f=fixture();f.props.onChange.mockImplementation(()=>{throw Error('SYNTHETIC publication refused.');});f.open();f.fill('Condition value','407');f.click('Save');
 expect(f.dialogs()).toHaveLength(1);expect(f.props.conditions[0].value).toBe('10');expect(f.props.onError).toHaveBeenCalledWith('SYNTHETIC publication refused.');
});
it('refuses blank, nondecimal and nonfinite values without substituting zero',()=>{
 const f=fixture();f.open();for(const value of ['','   ','0x10','Infinity','NaN','1e999','1'.repeat(65)]){f.fill('Condition value',value);f.click('Save');expect(f.props.onChange).not.toHaveBeenCalled();expect(f.dialogs()).toHaveLength(1);}
});
it('keeps unavailable, missing and duplicate sources explicit and refuses Save',()=>{
 const f=fixture();f.open();
 f.props.choices=[{...f.props.choices[0],unavailableReason:'SYNTHETIC source is unavailable.'}];f.ui.settle();f.click('Save');expect(f.props.onChange).not.toHaveBeenCalled();
 f.props.choices=[];f.ui.settle();expect(text(f.ui.settle())).toContain('Selected source unavailable');expect(text(f.ui.settle())).not.toContain('private source');f.click('Save');expect(f.props.onChange).not.toHaveBeenCalled();
 f.props.choices=[{id:'SYNTHETIC private source',label:'SYNTHETIC Close'},{id:'SYNTHETIC private source',label:'SYNTHETIC duplicate'}];f.ui.settle();f.click('Save');expect(f.props.onChange).not.toHaveBeenCalled();
});
it('validates channel bounds while retaining explicit equal limits and raw user text',()=>{
 const f=fixture();f.open();f.fill('Condition operator','inside');f.fill('Condition lower bound','3');f.fill('Condition upper bound','2');f.click('Save');expect(f.props.onChange).not.toHaveBeenCalled();
 f.fill('Condition upper bound','3');f.click('Save');expect(f.props.conditions[0]).toMatchObject({kind:'inside',lower:'3',upper:'3'});expect(text(f.ui.settle())).toContain('Inside channel · 3 to 3');
});
it('does not let an old Save close a newer dialog opened during the parent callback',()=>{
 const f=fixture();f.open();f.fill('Condition value','407');
 f.props.onChange.mockImplementation(()=>{f.open(2);return true;});f.click('Save');
 expect(f.dialogs()).toHaveLength(1);expect(f.dialogs()[0].props.title).toBe('Edit condition 2');expect(f.control('Condition value').props.value).toBe('11');
});
it('uses the real Modal close contract without publishing and ignores callbacks after unmount',()=>{
 const f=fixture();f.open();f.fill('Condition value','407');const save=f.button('Save').props.onClick,modal=f.dialogs()[0];
 invoke(modal.props.onClose);f.ui.settle();expect(f.dialogs()).toHaveLength(0);expect(f.props.onChange).not.toHaveBeenCalled();
 f.open();const later=f.button('Save').props.onClick;f.ui.dispose();invoke(save);invoke(later);expect(f.props.onChange).not.toHaveBeenCalled();
});
