import {all,mountControlledComponent,text,invoke} from '../helpers/alert-dialog-harness';
import {expect,it,vi} from 'vitest';
import {ChartBottomToolbar,type ChartBottomToolbarProps} from '../../src/ui/bottom-toolbar';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(extra:Partial<ChartBottomToolbarProps>={}){
 let props:ChartBottomToolbarProps={chartReady:true,timezone:'UTC',adjustment:'split-adjusted',now:()=>0,onRange:()=>{},onGoTo:()=>{},onTimezone:()=>{},session:'extended',onSession:()=>{},sessionOwner:{},...extra};
 const view=mountControlledComponent(()=>ChartBottomToolbar(props));view.settle();
 const button=()=>view.find(node=>node.props['data-name']==='lv-session-toggle');
 return{view,button,set:(next:Partial<ChartBottomToolbarProps>)=>{props={...props,...next};view.settle();},click:()=>{invoke(button().props.onClick);view.settle();},alerts:()=>all(view.render(),node=>node.props.role==='alert').map(text)};
}
it('shows clear extended-hours on and off states while preserving the accessible pressed toggle',()=>{
 const h=setup();expect(text(h.button())).toBe('Extended hours: On');expect(h.button().props['aria-label']).toBe('Extended trading hours');expect(h.button().props['aria-pressed']).toBe(true);expect(h.button().props.style).toMatchObject({minWidth:148,whiteSpace:'nowrap'});h.set({session:'regular'});expect(text(h.button())).toBe('Extended hours: Off');expect(h.button().props['aria-pressed']).toBe(false);
});
it('awaits the real session operation without duplicate requests or optimistic session changes',async()=>{
 let release!:()=>void;const work=new Promise<void>(resolve=>{release=resolve;}),change=vi.fn(()=>work),h=setup({onSession:change});h.click();h.click();expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenCalledWith('regular');expect(h.button().props.disabled).toBe(true);expect(h.button().props['aria-busy']).toBe(true);expect(text(h.button())).toBe('Extended hours: On');h.set({session:'regular'});expect(text(h.button())).toBe('Extended hours: Off');expect(h.button().props.disabled).toBe(true);release();await flush();h.view.settle();expect(h.button().props.disabled).toBe(false);expect(h.button().props['aria-busy']).toBeUndefined();
});
it('shows a rejected request beside its button without changing mode or opening another menu',async()=>{
 const work=Promise.reject(Error('SYNTHETIC session request refused'));void work.catch(()=>{});const h=setup({onSession:()=>work});h.click();await flush();h.view.settle();expect(h.alerts()).toEqual(['SYNTHETIC session request refused']);expect(text(h.button())).toBe('Extended hours: On');expect(h.button().props.disabled).toBe(false);expect(all(h.view.render(),node=>node.props.role==='menu')).toHaveLength(0);const parent=h.view.nodeFor(h.button()).parent;expect(parent?.querySelectorAll('[role="alert"]')).toHaveLength(1);
});
it('disables unavailable or busy session actions and presents the supported-source reason',()=>{
 const change=vi.fn(),reason='This source supplies regular trading hours only. Extended hours are unavailable.',h=setup({session:'regular',sessionReason:reason,onSession:change});expect(h.button().props.disabled).toBe(true);expect(h.button().props.title).toBe(reason);h.click();expect(change).not.toHaveBeenCalled();expect(text(h.view.render())).toContain(reason);h.set({sessionReason:undefined,sessionDisabled:true});h.click();expect(change).not.toHaveBeenCalled();expect(h.button().props.disabled).toBe(true);
});
it('omits the two-mode session toggle for unsupported sources without inventing a 24-hour option',()=>{
 const h=setup({session:undefined,onSession:undefined});expect(all(h.view.render(),node=>node.props['data-name']==='lv-session-toggle')).toHaveLength(0);expect(text(h.view.render())).not.toMatch(/24.?hours/i);
});
it('does not attach an old rejected operation to a replacement active chart',async()=>{
 let reject!:(cause:Error)=>void;const work=new Promise<void>((_resolve,fail)=>{reject=fail;});void work.catch(()=>{});const h=setup({onSession:()=>work});h.click();h.set({sessionOwner:{},session:'regular'});reject(Error('SYNTHETIC retired chart'));await flush();h.view.settle();expect(h.alerts()).toEqual([]);expect(text(h.button())).toBe('Extended hours: Off');expect(h.button().props.disabled).toBe(false);
});
it('retains the existing ADJ action independently of the hours toggle',()=>{
 const adjust=vi.fn(),change=vi.fn(),h=setup({dividendsAdjustment:false,onAdjust:adjust,onSession:change});const adj=h.view.find(node=>node.props['data-name']==='adj');expect(adj.props['aria-pressed']).toBe(false);invoke(adj.props.onClick);expect(adjust).toHaveBeenCalledWith(true);expect(change).not.toHaveBeenCalled();expect(text(adj)).toBe('ADJ');
});
