import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {all,focusDocument,input,invoke,ModelNode,mountControlledComponent,text,type ModelElement} from '../helpers/alert-dialog-harness';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {Modal,dialogNeighbor} from '../../src/ui/Modal';
import {createIndicatorLibrary,factoryIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInstanceLabels} from '../../src/ui/indicator-dialog-model';
import {realChart} from './indicator-real-port-harness';

// F-RSTALE (Restore factory default cleared the saved default, then refused
// on the instance staleness check) and IFACE7R-F2 (focus fell to the dialog element after Cancel / Confirm of the factory
// reset). Actual IndicatorDialog / IndicatorSettings / Modal handlers on the REAL indicator port, under the shared
// controlled hook and node model; MutationObserver delivery and Chromium's disabled-control focus fixup are driven by the
// test. No browser DOM, focus engine, GUI or package claim.
const observers:Array<{callback:()=>void;live:boolean}>=[];
class TestMutationObserver{entry:{callback:()=>void;live:boolean};constructor(callback:()=>void){this.entry={callback,live:false};observers.push(this.entry);}observe(){this.entry.live=true;}disconnect(){this.entry.live=false;}takeRecords(){return [];}}
// The node model has no textContent; the DOM's (used by the destructive check and the control fallback) is its text.
const textContent=Object.getOwnPropertyDescriptor(ModelNode.prototype,'textContent');
beforeAll(()=>{Object.defineProperty(ModelNode.prototype,'textContent',{configurable:true,get(this:ModelNode){return text(this.props.children);}});});
afterAll(()=>{if(textContent)Object.defineProperty(ModelNode.prototype,'textContent',textContent);else delete (ModelNode.prototype as any).textContent;});
beforeEach(()=>{observers.length=0;vi.stubGlobal('MutationObserver',TestMutationObserver);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();});

/** Names the focused node in a failure message (vitest cannot print model nodes as DOM elements). */
const focusName=(node:any)=>'focus on '+(node===focusDocument.body?'body':node?.props?.role==='dialog'?'dialog element':String(node?.props?.['aria-label']??text(node?.props?.children)));
type Write={state:'idle'|'background'|'blocking';waiters:Array<()=>void>};
function restoreDialog(options:{lateLibrary?:boolean;seed?:Array<'sma'|'ema'>}={}){
 const chart=realChart(),seed=options.seed??['sma'];
 const ids=seed.map(kind=>chart.port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind)));
 let library:IndicatorLibrary=createIndicatorLibrary(),pendingLibrary:IndicatorLibrary|null=null;
 const write:Write={state:'idle',waiters:[]},runDetached=vi.fn();
 const flags={transient:false};
 const onLibraryChange=vi.fn((next:IndicatorLibrary)=>{if(options.lateLibrary)pendingLibrary=next;else library=next;return true;});
 const props:any={chart:chart.controller,ownerToken:{},onLibraryChange,onClose:vi.fn(),onChange:vi.fn(()=>true),initialSelected:ids[0],
  storageWrite:{state:()=>write.state,afterWrite:(run:()=>void)=>{write.waiters.push(run);return()=>{const i=write.waiters.indexOf(run);if(i>=0)write.waiters.splice(i,1);};},runDetached}};
 // Routine autosave modelled as the settings fieldset disabling its descendants for a moment (bugfix-e pattern).
 const disableAll=(node:any):any=>Array.isArray(node)?node.map(disableAll):node&&typeof node==='object'&&node.props?{...node,props:{...node.props,...(node.type==='button'||node.type==='input'?{disabled:true}:{}),children:disableAll(node.props.children)}}:node;
 const expand=(node:any):any=>{
  if(Array.isArray(node))return node.map(expand);
  if(!node||typeof node!=='object'||!node.props)return node;
  if(node.type===IndicatorSettings){const tree=IndicatorSettings(node.props);return flags.transient?disableAll(tree):tree;}
  // React keeps a keyed row's DOM node; the node model keys identity only through data-alert-id (as in bugfix-d).
  const keyed=node.key!=null&&String(node.props.className??'').includes('instance-row')?{'data-alert-id':'indicator-row:'+node.key}:{};
  return node.props.children===undefined?{...node,props:{...node.props,...keyed}}:{...node,props:{...node.props,...keyed,children:expand(node.props.children)}};
 };
 const view=mountControlledComponent(()=>{const tree=IndicatorDialog({...props,instances:chart.port.list(),library}) as unknown as ModelElement;return expand(Modal(tree.props as Parameters<typeof Modal>[0]));});
 view.settle();
 /** One commit: Chromium moves focus off a control that became disabled, observers run, deferred checks settle. */
 const commit=()=>{view.settle();const active=focusDocument.activeElement as {disabled?:boolean}|null;if(active?.disabled)focusDocument.activeElement=focusDocument.body;for(const entry of observers)if(entry.live)entry.callback();vi.advanceTimersByTime(0);};
 const button=(name:string)=>view.find(node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));
 const has=(name:string)=>{try{button(name);return true;}catch{return false;}};
 const node=(name:string)=>view.nodeFor(button(name));
 /** Keyboard activation: focus the control, then Enter dispatches its click. */
 const press=(name:string)=>{const target=node(name);target.focus();invoke(button(name).props.onClick,input(target));commit();};
 const field=(name:string)=>view.find(item=>item.type==='input'&&item.props['aria-label']===name);
 const edit=(name:string,value:string)=>{invoke(field(name).props.onChange,{target:{value}});commit();};
 const status=()=>text(all(view.render(),item=>item.type==='p'&&item.props.role==='status').at(-1));// the editor's own status line, after the data status line
 const root=()=>view.nodeFor(view.find(item=>item.props.role==='dialog'));
 const active=()=>focusDocument.activeElement;
 const flushLibrary=()=>{if(pendingLibrary){library=pendingLibrary;pendingLibrary=null;}commit();};
 const end=()=>{write.state='idle';for(const run of write.waiters.splice(0))run();commit();};
 const labels=()=>indicatorInstanceLabels(chart.port.list());
 return {...chart,ids,props,view,write,runDetached,flags,onLibraryChange,commit,button,has,node,press,field,edit,status,root,active,flushLibrary,end,labels,get library(){return library;}};
}
/** Saved SMA default with Length 15, then the instance changed under the draft (row Hide/Show changes the fingerprint). */
function staleSetup(){
 const ui=restoreDialog();
 ui.edit('Length','15');ui.press('Save as default');
 expect(ui.status()).toMatch(/^Saved default for future instances/);
 expect(ui.library.defaults.sma?.inputs.length).toBe(15);
 ui.port.update(ui.ids[0],{visible:false});ui.commit();
 return ui;
}

it('F-RSTALE 1: Confirm on a changed instance is refused before any effect (default kept, draft kept, instance untouched)',()=>{
 const ui=staleSetup(),before=ui.library,instance=JSON.stringify(ui.port.list()[0]);
 ui.press('Restore factory default');expect(ui.has('Confirm factory default')).toBe(true);
 ui.press('Confirm factory default');
 expect(ui.onLibraryChange,'only the Save as default publish').toHaveBeenCalledTimes(1);
 expect(ui.library).toBe(before);expect(ui.library.defaults.sma?.inputs.length).toBe(15);
 expect(ui.status()).toMatch(/^This indicator changed/);
 expect(ui.field('Length').props.value).toBe('15');
 expect(JSON.stringify(ui.port.list()[0])).toBe(instance);
});

it('F-RSTALE 2: what is reported matches the state; a repeat refuses again; after Discard draft and reload Confirm clears the default',()=>{
 const ui=staleSetup(),before=JSON.stringify(ui.library);
 ui.press('Restore factory default');ui.press('Confirm factory default');
 expect(JSON.stringify(ui.library)).toBe(before);
 expect(ui.has('Confirm factory default'),'the refused confirmation stays open').toBe(true);
 ui.press('Confirm factory default');
 expect(ui.onLibraryChange).toHaveBeenCalledTimes(1);expect(JSON.stringify(ui.library)).toBe(before);
 expect(ui.status()).toMatch(/^This indicator changed/);
 ui.press('Discard draft and reload');
 expect(ui.has('Confirm factory default'),'reload closes the confirmation').toBe(false);
 ui.press('Restore factory default');ui.press('Confirm factory default');
 expect(ui.onLibraryChange).toHaveBeenCalledTimes(2);
 expect(ui.library.defaults.sma).toBeUndefined();
 expect(ui.status()).toBe('Future instances use factory defaults.');
 expect(ui.has('Confirm factory default')).toBe(false);
});

it('F-RSTALE 3: a Confirm queued during the autosave is refused without a publish when the instance changed during the wait',()=>{
 const ui=restoreDialog();
 ui.edit('Length','15');ui.press('Save as default');
 ui.press('Restore factory default');
 ui.write.state='background';
 ui.press('Confirm factory default');
 expect(ui.status()).toMatch(/workspace is saving/i);
 ui.port.update(ui.ids[0],{visible:false});ui.commit();
 ui.end();
 expect(ui.onLibraryChange,'no publish from the queued Confirm').toHaveBeenCalledTimes(1);
 expect(ui.library.defaults.sma?.inputs.length).toBe(15);
 expect(ui.status()).toMatch(/^This indicator changed/);
 expect(ui.runDetached,'the editor is open: nothing goes through the host').not.toHaveBeenCalled();
});

it('F-RSTALE 4: Save as default keeps its pre-mutation refusal and its success message',()=>{
 const ui=restoreDialog();
 ui.edit('Length','15');ui.port.update(ui.ids[0],{visible:false});ui.commit();
 ui.press('Save as default');
 expect(ui.onLibraryChange).not.toHaveBeenCalled();expect(ui.status()).toMatch(/^This indicator changed/);
 ui.press('Discard draft and reload');ui.edit('Length','15');ui.press('Save as default');
 expect(ui.onLibraryChange).toHaveBeenCalledOnce();
 expect(ui.status()).toBe('Saved default for future instances. Existing instances are unchanged.');
 expect(ui.library.defaults.sma?.inputs.length).toBe(15);
});

it('IFACE7R-F2 5: Cancel factory reset returns focus to Restore factory default, and a transient autosave disable keeps it there',()=>{
 const ui=restoreDialog();
 ui.edit('Length','15');ui.press('Save as default');
 ui.press('Restore factory default');
 ui.press('Cancel factory reset');
 expect(ui.has('Cancel factory reset')).toBe(false);
 expect(ui.active()===(ui.root()),focusName(ui.active())).toBe(false);
 expect(ui.active()===(ui.node('Restore factory default')),focusName(ui.active())).toBe(true);
 expect(ui.library.defaults.sma?.inputs.length,'Cancel keeps the saved default').toBe(15);
 ui.flags.transient=true;ui.commit();
 expect(ui.active()===(ui.root()),'parked on the dialog while the control is briefly disabled').toBe(true);
 vi.advanceTimersByTime(300);
 ui.flags.transient=false;ui.commit();vi.advanceTimersByTime(60);
 expect(ui.active()===(ui.node('Restore factory default')),focusName(ui.active())).toBe(true);
});

it('IFACE7R-F2 6: after Confirm (same commit) focus goes to the next usable non-destructive control after Restore',()=>{
 const ui=restoreDialog();
 ui.edit('Length','15');ui.press('Save as default');
 ui.press('Restore factory default');ui.press('Confirm factory default');
 expect(ui.status()).toBe('Future instances use factory defaults.');
 const restore=ui.node('Restore factory default');
 expect(restore.disabled).toBe(true);
 const neighbor=dialogNeighbor(ui.root() as unknown as HTMLElement,restore as unknown as HTMLElement);
 expect(neighbor).toBeTruthy();
 expect(ui.active()===(neighbor),focusName(ui.active())).toBe(true);
 expect(ui.active()===(ui.root()),focusName(ui.active())).toBe(false);
 expect(ui.active()===(ui.node('Discard draft and reload')),focusName(ui.active())).toBe(false);
});

it('IFACE7R-F2 7: a library prop that lands one commit late still ends on the same neighbor, never staying on the dialog',()=>{
 const ui=restoreDialog({lateLibrary:true});
 ui.edit('Length','15');ui.press('Save as default');ui.flushLibrary();
 ui.press('Restore factory default');ui.press('Confirm factory default');
 expect(ui.active()===(ui.node('Restore factory default')),'Restore is still enabled in this commit').toBe(true);
 ui.flushLibrary();
 const restore=ui.node('Restore factory default');expect(restore.disabled).toBe(true);
 vi.advanceTimersByTime(2100);
 const neighbor=dialogNeighbor(ui.root() as unknown as HTMLElement,restore as unknown as HTMLElement);
 expect(neighbor).toBeTruthy();expect(ui.active()===(neighbor),focusName(ui.active())).toBe(true);expect(ui.active()===(ui.root()),focusName(ui.active())).toBe(false);
});

it('IFACE7R-F2 8: row Remove and closing the editor still focus the Edit fallback (F10 unchanged)',()=>{
 const ui=restoreDialog({seed:['sma','ema']});
 const labels=ui.labels(),editSma='Edit '+labels.get(ui.ids[0]),editEma='Edit '+labels.get(ui.ids[1]);
 ui.press('Cancel');// the editor's Cancel closes the editor: focus goes to its own row
 expect(ui.has('Restore factory default')).toBe(false);
 expect(ui.active()===(ui.node(editSma)),focusName(ui.active())).toBe(true);
 ui.press('Remove '+labels.get(ui.ids[0]));// the next row takes its place
 expect(ui.active()===(ui.node(editEma)),focusName(ui.active())).toBe(true);
});
