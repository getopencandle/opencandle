import {beforeEach,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createMarketQueue} from '../../src/chart/market-queue';

// F-TAB (release 7 indicators receipt 20261017T073230446Z step
// sma-reset-draft-to-saved-default): after "Reset draft to saved defaults", one of the next editor tab clicks did not
// switch the tab. Root cause: every editor tab click (and every draft edit, Edit selection and editor close) went through
// the full editability check, App's assertAnalysisDialogEditable(true). During the ROUTINE background autosave App's own
// busy check lets that through, but the save's chart-tree hold reserves the chart's market queue
// (src/chart/tree-suspension.ts:7 port.reserve -> src/chart/adapter.ts:540 marketQueue.reserve), so
// controller.isInputCurrent (adapter.ts:350) is false and assertActiveAnalysisChart refuses with "The active chart
// analysis is unavailable. Reopen it before editing." The click was refused for as long as the autosave held the tree.
// Actual IndicatorDialog / IndicatorSettings handlers on the REAL indicator port; the host is App's guard chain under
// that hold: assertOwner (isInputOwned) stays true, assertEditable refuses. Model + component-handler evidence only;
// no DOM, focus, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog,renderIn}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const BUSY='The active chart changed or is busy.';
const UNAVAILABLE='The active chart analysis is unavailable. Reopen it before editing.';
const WAIT=/The workspace is saving\. This indicator change applies when the save finishes\./;

/** App's guard chain (App.tsx assertAnalysisDialogEditable(true) -> assertActiveAnalysisChart(true)) over the storage write:
 blocking refuses as busy; background passes the busy check but the tree hold makes isInputCurrent false. */
function hosted(options:Parameters<typeof dialog>[0]){
 const ui=dialog(options);
 const write={state:'idle' as 'idle'|'background'|'blocking',waiters:[] as Array<()=>void>},owner={current:true};
 ui.props.storageWrite={state:()=>write.state,afterWrite:(run:()=>void)=>{write.waiters.push(run);return()=>{const index=write.waiters.indexOf(run);if(index>=0)write.waiters.splice(index,1);};}};
 ui.props.assertOwner=()=>{if(!owner.current)throw new Error('This indicator control belongs to a previous chart source or replay position.');};
 ui.props.assertEditable=()=>{if(write.state==='blocking')throw new Error(BUSY);if(write.state==='background')throw new Error(UNAVAILABLE);};
 const capture=ui.props.onChange;ui.props.onChange=vi.fn(()=>{if(write.state!=='idle')throw new Error(BUSY);return capture();});
 const publishLibrary=ui.props.onLibraryChange;ui.props.onLibraryChange=vi.fn((value:any)=>write.state!=='idle'?false:publishLibrary(value));
 const end=()=>{write.state='idle';for(const run of write.waiters.splice(0))run();};
 /** The open editor's own tree (the harness's settings scope). */
 const sTree=()=>{ui.sText();const element=findAll(ui.render(),node=>node.type===IndicatorSettings)[0];return renderIn('settings:'+element.key,()=>IndicatorSettings(element.props)) as any;};
 const tab=()=>text(findAll(findAll(sTree(),node=>node.type==='nav')[0],node=>node.type==='button'&&node.props.className==='active')[0]);
 const status=()=>text(findAll(sTree(),node=>node.type==='p'&&node.props.role==='status').at(-1));
 const showIndicator=()=>{const label=findAll(sTree(),node=>node.type==='label'&&text(node).trim()==='Show indicator')[0];return label?findAll(label,node=>node.type==='input')[0]:null;};
 return Object.assign(ui,{write,owner,end,tab,status,showIndicator});
}
/** stageSma of scripts/exe/flows/indicators.mjs: Inputs, Length/offset, Style, Show indicator, sma visible/width, Visibility, interval rule, Inputs. */
function stageSma(ui:ReturnType<typeof hosted>,v:{length:string;offset:string;show:boolean;visible:boolean;width:string;mode:string}){
 ui.sClick('Inputs');ui.sEdit('Length',v.length);ui.sEdit('Display offset (bars)',v.offset);
 ui.sClick('Style');ui.showIndicator()!.props.onChange({target:{checked:v.show}});ui.sCheck('sma visible',v.visible);ui.sEdit('sma width',v.width);
 ui.sClick('Visibility');ui.sEdit('Indicator interval visibility',v.mode);
 ui.sClick('Inputs');
}
function savedDefaultEditor(){
 const ui=hosted({seed:['sma'],initialSelected:0});
 // sma-save-default-seeds-new-instances: the saved default is Length 15, offset 3, sma plot hidden and 5 wide.
 stageSma(ui,{length:'15',offset:'3',show:true,visible:false,width:'5',mode:'all'});
 ui.sClick('Save as default');expect(ui.status()).toContain('Saved default for future instances.');
 return ui;
}

it('premise: a chart-tree hold reserves the market queue, so the chart input is not current for the whole save',()=>{
 const queue=createMarketQueue({read:()=>({bars:[],source:{} as any}),write:()=>{},apply:async()=>{},disposed:()=>false});
 expect(queue.isPending()).toBe(false);
 const lease=queue.reserve();
 expect(queue.isPending(),'adapter isInputCurrent = !marketQueue.isPending() && ... is false while held').toBe(true);
 lease.release();expect(queue.isPending()).toBe(false);
});

it('F-TAB: the exact flow sequence: Reset draft to saved defaults, then Inputs, Style and Visibility during the autosave each switch the tab',()=>{
 const ui=savedDefaultEditor();
 stageSma(ui,{length:'40',offset:'1',show:true,visible:true,width:'3',mode:'exclude'});
 ui.sClick('Reset draft to saved defaults');
 expect(ui.status()).toBe('Saved defaults staged.');
 // The routine autosave (scheduled by the earlier Save as default / Add) starts its tree hold now.
 ui.write.state='background';
 ui.sClick('Inputs');
 expect(ui.tab()).toBe('Inputs');
 expect(ui.sField('Length').props.value).toBe('15');expect(ui.sField('Display offset (bars)').props.value).toBe(3);
 ui.sClick('Style');
 expect(ui.tab(),'the Style tab click switches the tab (status: '+ui.status()+')').toBe('Style');
 expect(ui.showIndicator()?.props.checked,'Show indicator is reachable and on').toBe(true);
 expect(ui.sField('sma visible').props.checked).toBe(false);expect(ui.sField('sma width').props.value).toBe(5);
 ui.sClick('Visibility');
 expect(ui.tab()).toBe('Visibility');
 expect(ui.sField('Indicator interval visibility').props.value).toBe('all');
 ui.sClick('Inputs');expect(ui.tab()).toBe('Inputs');
 expect(ui.status(),'no refusal is shown for a tab switch').toBe('Saved defaults staged.');
 ui.end();
 expect(ui.port.list()[0].inputs.length,'nothing applied implicitly').toBe(9);
});

it('F-TAB (debug run): the Placement tab of a second BB opens during the autosave',()=>{
 const ui=hosted({seed:['bb','bb'],initialSelected:1});
 ui.write.state='background';
 ui.sClick('Placement');
 expect(ui.tab()).toBe('Placement');
 expect(ui.sText()).toContain('Current placement:');
});

it('F-TAB: draft edits during the autosave keep every keystroke, and Apply is queued then runs (F14 intent on the real hold)',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='background';
 for(const typed of ['2','21'])ui.sEdit('Length',typed);
 expect(ui.sField('Length').props.value).toBe('21');
 ui.sSubmit();
 expect(ui.status()).toMatch(WAIT);
 expect(ui.port.list()[0].inputs.length,'nothing publishes into the hold').toBe(9);
 ui.end();
 expect(ui.port.list()[0].inputs.length).toBe(21);
 expect(ui.status()).toBe('Indicator settings applied.');
});

it('F-TAB: Edit selection and Cancel (closing the editor) work during the autosave',()=>{
 const ui=hosted({seed:['sma','ema'],initialSelected:0});
 ui.write.state='background';
 ui.click('Edit '+ui.labels().get(ui.ids[1]));
 expect(ui.selected()).toBe(ui.ids[1]);
 ui.sClick('Cancel');
 expect(ui.selected(),'the editor closes').toBe(null);
 expect(text(findAll(ui.render(),node=>node.type==='span'&&node.props.role==='alert')[0])).toBe('');
});

it('guards kept: a blocking operation still refuses draft edits and publications, and a lost owner refuses tab switches',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='blocking';
 ui.sEdit('Length','30');
 expect(ui.status()).toContain(BUSY);expect(String(ui.sField('Length').props.value)).toBe('9');
 ui.sSubmit();expect(ui.port.list()[0].inputs.length).toBe(9);
 ui.end();
 // A previous chart source owns the dialog: no tab switch, no edit, no publication (owner guard unchanged).
 ui.owner.current=false;
 for(const state of ['idle','background'] as const){
  ui.write.state=state;
  ui.sClick('Style');expect(ui.tab()).toBe('Inputs');
  ui.sEdit('Length','31');expect(String(ui.sField('Length').props.value)).toBe('9');
 }
 ui.write.state='idle';ui.owner.current=true;
 ui.sClick('Style');expect(ui.tab()).toBe('Style');
});
