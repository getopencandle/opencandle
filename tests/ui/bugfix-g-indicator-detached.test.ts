import {beforeEach,expect,it,vi} from 'vitest';
import {findAll,makeHarness,text} from './indicator-real-port-harness';

// R-G1-1 (a change queued from the Indicators dialog during the
// routine autosave was dropped without notice when the dialog closed before the write ended. Actual IndicatorDialog /
// IndicatorSettings handlers on the real indicator port; the host models App's analysisStorageWrite (waiters run after the
// write) and records what the dialog hands to runDetached. The App half (owner/epoch checks, visible refusal) is
// tests/ui/bugfix-g-indicator-detached-app.test.ts. Component-handler evidence only; no DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

function hosted(options:Parameters<typeof dialog>[0]){
 const ui=dialog(options);
 const write={state:'idle' as 'idle'|'background'|'blocking',waiters:[] as Array<()=>void>};
 const reports:string[]=[];
 // The host applies a detached change with its own checks (App: runDetachedIndicatorChange) and reports the outcome.
 const runDetached=vi.fn((action:any)=>{try{if(action.kind==='library'){if(ui.props.library!==action.expected)throw new Error('The indicator library changed.');ui.props.onLibraryChange(action.next);}else action.run();reports.push('applied');}catch(error){reports.push('refused: '+String(error));}});
 ui.props.storageWrite={state:()=>write.state,afterWrite:(run:()=>void)=>{write.waiters.push(run);return()=>{const index=write.waiters.indexOf(run);if(index>=0)write.waiters.splice(index,1);};},runDetached};
 const end=()=>{write.state='idle';for(const run of write.waiters.splice(0))run();};
 const close=()=>findAll(ui.render(),node=>node.type==='button'&&text(node)==='Close')[0].props.onClick();
 return Object.assign(ui,{write,end,close,runDetached,reports});
}

it('R-G1-1: a row action queued during the autosave survives closing the dialog and applies once',()=>{
 const ui=hosted({seed:['ema']});
 ui.write.state='background';
 ui.click('Hide EMA 9 close');
 ui.click('Add Simple Moving Average');
 ui.click('Favorite Relative Strength Index');
 expect(ui.port.list()[0].visible).toBe(true);
 ui.close();expect(ui.props.onClose).toHaveBeenCalledOnce();
 ui.end();
 expect(ui.runDetached,'each queued action is handed to the host exactly once').toHaveBeenCalledTimes(3);
 expect(ui.reports).toEqual(['applied','applied','applied']);
 expect(ui.port.list().map(row=>[row.kind,row.visible])).toEqual([['ema',false],['sma',true]]);
 expect(ui.library.favorites).toContain('rsi');
 expect(ui.props.onChange,'the closed dialog publishes nothing itself').not.toHaveBeenCalled();
 ui.end();expect(ui.runDetached).toHaveBeenCalledTimes(3);
});

it('R-G1-1: while the dialog stays open the queued action runs in the dialog, not through the host',()=>{
 const ui=hosted({seed:['ema']});
 ui.write.state='background';ui.click('Hide EMA 9 close');ui.end();
 expect(ui.runDetached).not.toHaveBeenCalled();
 expect(ui.port.list()[0].visible).toBe(false);expect(ui.props.onChange).toHaveBeenCalledOnce();
});

it('R-G1-1: an editor Apply queued during the autosave applies once after the dialog closes',()=>{
 const ui=hosted({seed:['sma','ema'],initialSelected:0});
 ui.write.state='background';
 ui.sEdit('Length','20');ui.sSubmit();
 ui.close();ui.end();
 expect(ui.runDetached).toHaveBeenCalledOnce();expect(ui.reports).toEqual(['applied']);
 expect(ui.port.list()[0].inputs.length).toBe(20);
});

it('R-G1-1: a queued editor Apply whose indicator changed before the write ended is refused with a reason',()=>{
 const other=hosted({seed:['sma'],initialSelected:0});
 other.write.state='background';
 other.sEdit('Length','20');other.sSubmit();other.close();
 other.port.update(other.ids[0],{inputs:{...other.port.list()[0].inputs,length:15}});
 other.end();
 expect(other.runDetached).toHaveBeenCalledOnce();
 expect(other.reports[0],'a stale queued edit is refused with a reason').toMatch(/^refused: .*This indicator changed/);
 expect(other.port.list()[0].inputs.length).toBe(15);
});
