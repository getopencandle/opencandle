import {beforeEach,expect,it,vi} from 'vitest';
import {makeHarness,domainBars,valuesOf,expected} from './indicator-real-port-harness';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {indicatorAbsentDefaults,indicatorEffectiveInputs,type IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {resetIncompatibleFrame} from '../../src/ui/frame-reset-policy';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {ensureWorkspaceGrid,workspaceDatasets} from '../../src/ui/workspace-grid';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import type {IndicatorId} from '../../src/domain/indicators';

// Inputs added after charts were saved (legacyOmit + legacyDefval, such as "Require breakout confirmation"): a saved
// instance without the key runs with the old value, so the dialog, its change detection, Save as default and the frame
// policy all have to use that value, never the new-instance default. SYNTHETIC bars; model + handler evidence only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

const KIND='chpbullpennant' as IndicatorId,BOX='Require breakout confirmation';
const snap=(id:string,kind:IndicatorId,inputs:Record<string,unknown>):IndicatorSnapshot=>({id,kind,inputs,plots:{},offset:0,visible:true,paneId:null} as unknown as IndicatorSnapshot);
function legacy(inputs:Record<string,unknown>={pivotLength:5,tolerance:2}){
 const ui=dialog();ui.port.restore([snap('saved',KIND,inputs)]);
 const open=()=>{scopes.clear();ui.click('Edit '+ui.labels().get('saved'));};
 return Object.assign(ui,{open,row:()=>ui.port.list().find(item=>item.id==='saved')!});
}

it('the Inputs tab shows a keyless saved instance with the box off, the value it really runs with, and a new instance with it on',()=>{
 const ui=legacy();expect(Object.hasOwn(ui.row().inputs,'breakout')).toBe(false);
 ui.open();expect(ui.sField(BOX).props.checked).toBe(false);expect(ui.sText()).toMatch(/No unapplied changes/);
 const fresh=dialog({seed:[KIND],initialSelected:0});expect(fresh.sField(BOX).props.checked).toBe(true);
});

it('ticking the box on for a keyless saved instance is an unapplied change that Apply persists',()=>{
 const ui=legacy();ui.open();
 ui.sCheck(BOX,true);
 expect(ui.sText()).toMatch(/Unapplied changes/);expect(ui.sText()).not.toMatch(/No unapplied changes/);
 expect(Object.hasOwn(ui.row().inputs,'breakout'),'nothing is written before Apply').toBe(false);
 ui.sSubmit();expect(ui.row().inputs.breakout).toBe(true);
 ui.open();expect(ui.sField(BOX).props.checked).toBe(true);expect(ui.sText()).toMatch(/No unapplied changes/);
});

it('ticking the box on and back off leaves no unapplied change on a keyless saved instance',()=>{
 const ui=legacy();ui.open();ui.sCheck(BOX,true);ui.sCheck(BOX,false);
 expect(ui.sText()).toMatch(/No unapplied changes/);
});

it('Reset draft to factory stages the new-instance values; only Apply writes them to the saved instance',()=>{
 const ui=legacy();ui.open();
 expect(ui.sField(BOX).props.checked,'before the reset').toBe(false);
 ui.sClick('Reset draft to factory');
 expect(ui.sField(BOX).props.checked).toBe(true);expect(ui.sText()).toMatch(/Unapplied changes/);
 expect(Object.hasOwn(ui.row().inputs,'breakout'),'staged only').toBe(false);
 ui.sSubmit();expect(ui.row().inputs.breakout).toBe(true);
});

it('Save as default from a keyless saved instance stores its effective values, so a new instance behaves the same',()=>{
 // CCI Smoothing type was added later with the old value None; a new instance gets SMA.
 const ui=dialog();ui.port.restore([snap('old-cci','cci',{length:20,source:'close'})]);
 ui.click('Edit '+ui.labels().get('old-cci'));
 expect(ui.sField('Smoothing type').props.value,'a saved instance shows the value it runs with').toBe('None');
 ui.sClick('Save as default');
 expect(ui.library.defaults.cci?.inputs.maType).toBe('None');
 ui.click('Add '+indicatorNames.cci);
 const added=ui.port.list().filter(item=>item.id!=='old-cci');expect(added).toHaveLength(1);
 expect(added[0].inputs.maType).toBe('None');
});

it('Save as default after ticking the box on gives new instances the box on',()=>{
 const ui=legacy();ui.open();ui.sCheck(BOX,true);ui.sClick('Save as default');
 expect(ui.library.defaults[KIND]?.inputs.breakout).toBe(true);
});

it('a keyless saved instance keeps its legacy calculation through serialize and restore',()=>{
 const ui=legacy({pivotLength:5,tolerance:2});
 const first=ui.port.serialize();
 const again=dialog();again.port.restore(structuredClone(first));
 const row=again.port.list().find(item=>item.id==='saved')!;
 expect(Object.hasOwn(row.inputs,'breakout')&&row.inputs.breakout===true).toBe(false);
 expect(again.port.serialize()).toEqual(first);
 expect(valuesOf(again.port,'saved')).toEqual(expected(KIND,{...row.inputs,breakout:false},domainBars));
});

it('the effective inputs of a keyless saved instance carry the legacy value; a plain default and a present key are untouched',()=>{
 expect(indicatorAbsentDefaults[KIND].breakout).toBe(false);
 expect(indicatorEffectiveInputs(KIND,{}).breakout).toBe(false);
 expect(indicatorEffectiveInputs(KIND,{breakout:true}).breakout).toBe(true);
 expect(indicatorAbsentDefaults.cci.maType,'a legacyOmit string input').toBe('None');
});

it('the frame policy sees a keyless saved instance turning the breakout box on as a study change',()=>{
 const workspace=ensureWorkspaceGrid(createInitialWorkspace()),cell=workspace.grid.cells[workspace.grid.layout.activeCellId],sources=workspaceDatasets(workspace);
 const frame={schemaVersion:1,panes:[]} as unknown as NonNullable<typeof cell.frame>;
 const study=(inputs:Record<string,unknown>)=>({id:'saved',kind:KIND,inputs,plots:{},offset:0,visible:true,paneId:'pane-1'}) as any;
 const before={...cell,frame,chartOptions:{...cell.chartOptions,auto:false},indicators:[study({pivotLength:5,tolerance:2})]};
 const on=resetIncompatibleFrame(before,{...before,indicators:[study({pivotLength:5,tolerance:2,breakout:true})]},sources,sources);
 expect(on.frame,'the saved frame cannot be proven for the new calculation').toBeUndefined();
 const off=resetIncompatibleFrame(before,{...before,indicators:[study({pivotLength:5,tolerance:2,breakout:false})]},sources,sources);
 expect(off.frame,'an explicit false is the same calculation').toBe(frame);
});

it('in the live-preview editor, Cancel puts a keyless saved instance back to the calculation it had',()=>{
 const ui=dialog();ui.port.restore([snap('saved',KIND,{pivotLength:5,tolerance:2})]);
 ui.props.compact=true;ui.props.initialSelected='saved';
 expect(ui.sField(BOX).props.checked).toBe(false);
 ui.sCheck(BOX,true);expect(ui.port.list()[0].inputs.breakout,'previewed on the chart').toBe(true);
 ui.sClick('Cancel');
 expect(ui.port.list()[0].inputs.breakout,'the preview is reverted, not left on').not.toBe(true);
});

it('the legend shows a keyless saved CCI with the smoothing type it runs with, and a new one with SMA',async()=>{
 const {indicatorLegendArguments}=await import('../../src/chart/indicator-display');
 expect(indicatorLegendArguments('cci',{length:20,source:'close'})).toContain('None');
 expect(indicatorLegendArguments('cci',{length:20,source:'close'})).not.toContain('SMA');
 expect(indicatorLegendArguments('cci',{length:20,source:'hlc3',maType:'SMA',maLength:14,bbMult:2})).toContain('SMA');
});

it('Save as default writes only the inputs whose saved meaning differs from the new default',()=>{
 expect(indicatorEffectiveInputs('cci',{length:20,source:'close'})).toEqual({length:20,source:'close',maType:'None'});
 const written=Object.keys(indicatorEffectiveInputs(KIND,{pivotLength:5,tolerance:2})).filter(key=>!['pivotLength','tolerance'].includes(key)).sort();
 const changing=catalogDefinition(KIND)!.inputs.filter(input=>input.legacyOmit&&input.legacyDefval!==undefined).map(input=>input.key).sort();
 expect(written).toEqual(changing);expect(written).toContain('breakout');
});
