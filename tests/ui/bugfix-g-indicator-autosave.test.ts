import {beforeEach,expect,it,vi} from 'vitest';
import {findAll,makeHarness,text} from './indicator-real-port-harness';

// Indicator editors and row actions were silently
// refused while the ROUTINE background autosave held the storage lock. Actual IndicatorDialog / IndicatorSettings handlers
// on the real indicator port. The host is modelled after App: assertEditable is App's assertAnalysisDialogEditable(true)
// (refuses only during a blocking operation), onChange is App's confirmAnalysisCapture (refuses during any storage write),
// onLibraryChange is App's commit (refused during any write) and storageWrite is App's analysisStorageWrite.
// Model + component-handler evidence only; no DOM, focus, keyboard, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const BUSY='The active chart changed or is busy.';
const WAIT=/The workspace is saving\. This indicator change applies when the save finishes\./;

function hosted(options:Parameters<typeof dialog>[0]){
 const ui=dialog(options);
 const write={state:'idle' as 'idle'|'background'|'blocking',waiters:[] as Array<()=>void>};
 ui.props.storageWrite={state:()=>write.state,afterWrite:(run:()=>void)=>{write.waiters.push(run);return()=>{const index=write.waiters.indexOf(run);if(index>=0)write.waiters.splice(index,1);};}};
 ui.props.assertEditable=()=>{if(write.state==='blocking')throw new Error(BUSY);};
 const capture=ui.props.onChange;ui.props.onChange=vi.fn(()=>{if(write.state!=='idle')throw new Error(BUSY);return capture();});
 const publishLibrary=ui.props.onLibraryChange;ui.props.onLibraryChange=vi.fn((value:any)=>write.state!=='idle'?false:publishLibrary(value));
 /** The write ends: App clears the lock, then runs the registered waiters. */
 const end=()=>{write.state='idle';for(const run of write.waiters.splice(0))run();};
 const footer=()=>{const tree=ui.render();return {alert:text(findAll(tree,node=>node.props?.role==='alert'&&node.type==='span')[0]),status:text(findAll(tree,node=>node.props?.role==='status'&&node.type==='span')[0])};};
 return Object.assign(ui,{write,end,footer});
}

it('F14: during the routine autosave the editor stays editable, Apply is announced and runs when the write ends',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='background';
 ui.sEdit('Length','20');
 expect(ui.sField('Length').props.value,'the keystroke reached the draft').toBe('20');
 ui.sSubmit();
 expect(ui.port.list()[0].inputs.length,'nothing published into the storage lock').toBe(9);
 expect(ui.props.onChange).not.toHaveBeenCalled();
 expect(ui.sText()).toMatch(WAIT);
 ui.end();
 expect(ui.port.list()[0].inputs.length).toBe(20);
 expect(ui.props.onChange).toHaveBeenCalledOnce();
 expect(ui.sText()).toContain('Indicator settings applied.');
 expect(ui.sText()).not.toMatch(WAIT);
});

it('F14: typing character by character during the autosave keeps every character',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='background';
 // Each keystroke is a draft change; none is dropped while the write holds the lock (an earlier build saw "#FF0000" arrive as "#FF00").
 ui.sClick('Style');ui.sClick('Inputs');
 for(const typed of ['1','12','123'])ui.sEdit('Length',typed);
 expect(ui.sField('Length').props.value).toBe('123');
 ui.end();
 expect(ui.port.list()[0].inputs.length,'drafts never publish by themselves').toBe(9);
});

it('F14: row actions (add, hide, favorite, remove) wait for the write, are announced, then apply',()=>{
 const ui=hosted({seed:['ema','ema']});
 ui.write.state='background';
 ui.click('Add Simple Moving Average');
 expect(ui.port.list().map(row=>row.kind)).toEqual(['ema','ema']);
 expect(ui.footer().status).toMatch(WAIT);expect(ui.footer().alert).toBe('');
 ui.end();
 expect(ui.port.list().map(row=>row.kind)).toEqual(['ema','ema','sma']);
 expect(ui.footer().status).toContain('added');
 ui.write.state='background';
 ui.click('Hide EMA 9 close #1');
 expect(ui.port.list()[0].visible).toBe(true);expect(ui.footer().status).toMatch(WAIT);
 ui.end();
 expect(ui.port.list()[0].visible).toBe(false);expect(ui.footer().status).not.toMatch(WAIT);expect(ui.footer().alert).toBe('');
 ui.write.state='background';
 ui.click('Favorite Relative Strength Index');
 expect(ui.library.favorites).not.toContain('rsi');expect(ui.footer().status).toMatch(WAIT);
 ui.end();
 expect(ui.library.favorites).toContain('rsi');
 ui.write.state='background';
 ui.click('Remove EMA 9 close #2');
 expect(ui.port.list()).toHaveLength(3);expect(ui.footer().status).toMatch(WAIT);
 ui.end();
 expect(ui.port.list().map(row=>row.kind)).toEqual(['ema','sma']);
 expect(ui.footer().alert).toBe('');
 expect(ui.props.onChange,'one capture per applied action: add, hide, favorite, remove').toHaveBeenCalledTimes(4);
});

it('F14: a blocking operation (explicit Save, layout, restore) still refuses, and the refusal is shown',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='blocking';
 ui.sEdit('Length','20');
 expect(ui.sField('Length').props.value).toBe('9');
 expect(ui.sText(),'the editor says why the keystroke was refused').toContain(BUSY);
 ui.sSubmit();
 expect(ui.port.list()[0].inputs.length).toBe(9);expect(ui.sText()).toContain(BUSY);
 ui.click('Hide SMA 9 close');
 expect(ui.port.list()[0].visible).toBe(true);expect(ui.footer().alert).toContain(BUSY);
 expect(ui.write.waiters,'blocking operations queue nothing').toEqual([]);
 ui.end();
 ui.sEdit('Length','20');expect(ui.sField('Length').props.value).toBe('20');
});

it('F14: an Apply queued during the write does not run a draft that changed meanwhile, and says so',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='background';
 ui.sEdit('Length','20');ui.sSubmit();
 ui.sEdit('Length','30');
 ui.end();
 expect(ui.port.list()[0].inputs.length).toBe(9);
 expect(ui.sText()).toContain('The draft changed while the workspace was saving');
 ui.sSubmit();expect(ui.port.list()[0].inputs.length).toBe(30);
});
