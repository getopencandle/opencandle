import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {logicalScriptFixture} from '../fixtures/script-derived-position';
import {commandCanvas} from '../chart/chart-paint-harness';
import {ScriptLegendRows,ScriptSettingsDialog,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {scriptOutputs} from '../../src/ui/script-outputs';
import {applyScriptSettings} from '../../src/ui/script-settings-model';
import {restoreScriptBindings} from '../../src/ui/script-library';
import {readScriptReadoutPosition} from '../../src/chart/script-presentation-proof';
import {installIndicatorDisplay} from '../../src/chart/indicator-display';

// Uses the genuine main fixture after producer integration, one canonical proof
// module and original native renderer. No source/SDK/fixture copy belongs here.
type Fixture=Awaited<ReturnType<typeof logicalScriptFixture>>;
const held:Fixture[]=[],mounted:Array<{dispose():void}>=[];
beforeEach(()=>{let sequence=0;vi.stubGlobal('requestAnimationFrame',()=>++sequence);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();for(const f of held.splice(0).reverse())f.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(){const f=await logicalScriptFixture();held.push(f);await f.start(`({onBar(ctx){ctx.plot('Close',ctx.bar.close);ctx.plot('Other',ctx.bar.close+3);}})`);return f;}
function settings(f:Fixture){
 const metadata=f.port.presentationMetadata!().find(row=>row.id===f.binding.id)!;expect(metadata.stylesAvailable).toBe(true);let saved=f.binding;
 const props:Parameters<typeof ScriptSettingsDialog>[0]={binding:saved,entry:scriptOutputs.get(f.port,saved.id),renderedPlots:{...metadata.renderedPlots},plotTitles:Object.fromEntries(metadata.plots.map(row=>[row.id,row.title])),onClose:()=>{},onApply:change=>{saved=applyScriptSettings([saved],saved.id,change)[0];f.binding.plots=saved.plots;props.binding=saved;f.runtime.update({...f.context(),bindings:[saved]});return true;}};
 const ui=mountControlledComponent(()=>ScriptSettingsDialog(props));mounted.push(ui);ui.settle();invoke(ui.find(node=>node.type==='button'&&text(node)==='Style').props.onClick);ui.settle();
 return{ui,get saved(){return saved;},change(label:string,value:boolean){invoke(ui.find(node=>node.type==='input'&&node.props['aria-label']==='Close '+label).props.onChange,{target:{checked:value}});ui.settle();invoke(ui.find(node=>node.type==='button'&&text(node)==='Apply').props.onClick);ui.settle();expect(text(ui.render())).toContain('Applied.');}};
}
const values=(f:Fixture,surface:'legend'|'dataWindow')=>{const model=f.record().model,pane=f.native.scene.panes.get(model.paneId);return f.native.readoutRowsFor(model,2,pane,surface).map((row:any)=>Number(row.value));};

it.each([['legend','values in the status line'],['dataWindow','values in the Data Window']] as const)('actual dialog %s choice reaches accepted Runtime/private/native readouts without recalculation',async(flag,label)=>{
 const f=await fixture(),h=settings(f),before=f.view(),paint=f.record().model.series.map((row:any)=>row.points.map((point:any)=>point.value));const admittedSeries=f.record().model.series[0];expect(admittedSeries).toBeDefined();const admittedSeriesId=admittedSeries.id;expect(admittedSeriesId).toBeTypeOf('string');expect(values(f,'legend')).toEqual([16,19]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(readScriptReadoutPosition(before,{kind:'latest'}).plots.map(row=>row.value)).toEqual([16,19]);
 h.change(label,false);expect(h.saved.plots['lvplot:Close'][flag]).toBe(false);expect(restoreScriptBindings([h.saved])[0].plots).toEqual(h.saved.plots);expect(()=>before.assertCurrent()).toThrow();expect(f.workerCalls()).toBe(1);expect(f.executions).toHaveLength(1);
 const model=f.record().model;expect(model.series.find((row:any)=>row.id===admittedSeriesId).display[flag]).toBe(false);expect(model.series.every((row:any)=>row.display.pane===true)).toBe(true);expect(model.series.map((row:any)=>row.points.map((point:any)=>point.value))).toEqual(paint);
 expect(values(f,flag==='legend'?'legend':'dataWindow')).toEqual([19]);expect(values(f,flag==='legend'?'dataWindow':'legend')).toEqual([16,19]);expect(readScriptReadoutPosition(f.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual(flag==='legend'?[19]:[16,19]);
 h.change(label,true);expect(values(f,'legend')).toEqual([16,19]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(readScriptReadoutPosition(f.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual([16,19]);expect(f.workerCalls()).toBe(1);
});

it('global status visibility suppresses actual active and native values without rewriting either saved per-plot choice',async()=>{
 const f=await fixture(),h=settings(f);h.change('values in the status line',false);const saved=structuredClone(h.saved),recording=commandCanvas(),previous={make:f.native.makeDataCanvas,mode:f.native.backendMode,backend:f.native.backend};let backend:any,display:ReturnType<typeof installIndicatorDisplay>|undefined;
 try{
  f.native.backendMode='canvas2d';f.native.makeDataCanvas=()=>recording.canvas;expect(f.native.createGeometryBackend()).toBe(recording.canvas);backend=f.native.backend;display=installIndicatorDisplay(f.renderer,f.chart,f.nativeIndicators);
  const props:ScriptLegendRowsProps={chart:{...f.chart,scripts:f.port} as any,bindings:[h.saved],showTitles:true,showValues:true,position:{kind:'latest'},owner:{},isCurrent:()=>true,onBindingsChange:()=>true};const legend=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(legend);legend.settle();const scalar=()=>all(legend.render(),node=>node.props['data-legend-values']==='true').map(text);
  expect(scalar()).toEqual(['19.00']);expect(values(f,'legend')).toEqual([19]);display.setOptions({labelsVisible:false,valuesVisible:false});props.showValues=false;legend.settle();expect(scalar()).toEqual([]);expect(values(f,'legend')).toEqual([]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(h.saved).toEqual(saved);expect(f.binding.plots).toEqual(saved.plots);
  display.setOptions({labelsVisible:true,valuesVisible:true});props.showValues=true;legend.settle();expect(scalar()).toEqual(['19.00']);expect(values(f,'legend')).toEqual([19]);expect(h.saved).toEqual(saved);expect(f.workerCalls()).toBe(1);expect(readScriptReadoutPosition(f.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual([19]);
 }finally{try{display?.dispose();}finally{try{backend?.destroy();}finally{f.native.makeDataCanvas=previous.make;f.native.backendMode=previous.mode;f.native.backend=previous.backend;}}}
});
