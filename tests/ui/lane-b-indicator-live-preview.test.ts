import {beforeEach,expect,it,vi} from 'vitest';
import {findAll,makeHarness} from './indicator-real-port-harness';

// Compact per-indicator settings that preview live; Cancel reverts; Ok commits once.
// Actual IndicatorDialog / IndicatorSettings handlers on the real port. No DOM, focus or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const compact=()=>{const ui=dialog({seed:['sma'],initialSelected:0});ui.props.compact=true;return ui;};

it('the compact dialog shows only the settings editor, with Inputs, Style and Visibility and no catalog',()=>{
 const ui=compact();const tree=ui.render();
 expect(findAll(tree,node=>node.props?.['aria-label']==='Search indicators')).toHaveLength(0);
 expect(findAll(tree,node=>node.props?.['aria-label']==='Add Simple Moving Average')).toHaveLength(0);
 expect(ui.sButton('Inputs')).toBeTruthy();expect(ui.sButton('Style')).toBeTruthy();expect(ui.sButton('Visibility')).toBeTruthy();expect(()=>ui.sButton('Placement')).toThrow();
 expect(ui.sText()).not.toContain('Apply indicator settings');
 expect(ui.sHas('Length')).toBe(true);
});
it('an input edit reaches the chart at once, without a publication, and Cancel restores the original',()=>{
 const ui=compact(),before=ui.port.list()[0].inputs.length;
 ui.sEdit('Length','33');
 expect(ui.port.list()[0].inputs.length).toBe(33);expect(ui.props.onChange).not.toHaveBeenCalled();
 ui.sClick('Cancel');
 expect(ui.port.list()[0].inputs.length).toBe(before);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('Ok publishes once, keeps the preview and closes',()=>{
 const ui=compact();
 ui.sEdit('Length','21');
 expect(ui.sButton('OK').props.type).toBe('submit');ui.sSubmit();
 expect(ui.port.list()[0].inputs.length).toBe(21);expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('an invalid draft is not previewed and Ok is disabled',()=>{
 const ui=compact(),before=ui.port.list()[0].inputs.length;
 ui.sEdit('Length','0');
 expect(ui.port.list()[0].inputs.length).toBe(before);
 expect(ui.sButton('OK').props.disabled).toBe(true);
});
it('closing the window from outside (Escape or the close box) reverts an uncommitted preview',()=>{
 const ui=compact(),before=ui.port.list()[0].inputs.length;
 ui.sEdit('Length','44');expect(ui.port.list()[0].inputs.length).toBe(44);
 const modal=ui.render();modal.props.onClose();
 expect(ui.port.list()[0].inputs.length).toBe(before);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('Defaults offers Reset settings, which previews the factory values',()=>{
 const ui=compact();ui.sEdit('Length','50');
 ui.sClick('Reset settings');
 expect(ui.port.list()[0].inputs.length).toBe(9);
 expect(ui.sButton('Save as default')).toBeTruthy();
});
