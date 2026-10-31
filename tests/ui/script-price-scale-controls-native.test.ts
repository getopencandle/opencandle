import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,text,invoke} from '../helpers/alert-dialog-harness';
import {scriptPriceScaleFixture} from '../fixtures/script-price-scale';
import {ScriptLegendRows,ScriptSettingsDialog,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {CellScriptSettings} from '../../src/ui/CellStudyLegend';
import {applyScriptSettings} from '../../src/ui/script-settings-model';
import {restoreScriptBindings} from '../../src/ui/script-library';
import {readScriptReadoutPosition,scriptPriceScaleControlsAvailable} from '../../src/chart/script-presentation-proof';
import {setIndicatorScalePlacement} from '../../src/chart/indicator-scale';

type Fixture=Awaited<ReturnType<typeof scriptPriceScaleFixture>>;type Props=Parameters<typeof ScriptSettingsDialog>[0];
const held:Fixture[]=[],mounted:Array<{dispose():void}>=[];
beforeEach(()=>{let sequence=0;vi.stubGlobal('requestAnimationFrame',()=>++sequence);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();for(const f of held.splice(0).reverse())f.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(){const f=await scriptPriceScaleFixture();held.push(f);await f.start('({onBar(ctx){ctx.plot("First",16);ctx.plot("Second",19);}})');return f;}
function settings(f:Fixture,inactive=false){
 let saved=f.binding,bindings=[saved],props!:ScriptLegendRowsProps;const chart={scripts:f.port}as any,apply=(change:Parameters<Props['onApply']>[0])=>{bindings=applyScriptSettings(bindings,saved.id,change);saved=bindings[0];f.binding.plots=saved.plots;f.runtime.update({...f.context(),bindings});if(props)props.bindings=bindings;cellProps.binding=saved;return true;};
 props={chart,bindings,showValues:false,showTitles:true,owner:{},isCurrent:()=>true,onBindingsChange:next=>{bindings=next;saved=next[0];f.binding.plots=saved.plots;f.runtime.update({...f.context(),bindings});props.bindings=bindings;return true;}};
 const cellProps:Parameters<typeof CellScriptSettings>[0]={chart,binding:saved,assertOwner:()=>{},onApply:apply,onClose:()=>{}};
 const parent=mountControlledComponent(()=>inactive?CellScriptSettings(cellProps):ScriptLegendRows(props));mounted.push(parent);parent.settle();if(!inactive){invoke(parent.find(node=>node.props['aria-label']==='Settings for '+saved.name).props.onClick);parent.settle();}
 let dialog=parent.find(node=>node.type===ScriptSettingsDialog).props as unknown as Props;const ui=mountControlledComponent(()=>ScriptSettingsDialog(dialog));mounted.push(ui);ui.settle();invoke(ui.find(node=>node.type==='button'&&text(node)==='Style').props.onClick);ui.settle();
 const sync=()=>{parent.settle();dialog=parent.find(node=>node.type===ScriptSettingsDialog).props as unknown as Props;ui.settle();};
 return{ui,get saved(){return saved;},flag(){return ui.find(node=>node.type==='input'&&node.props['aria-label']==='First labels on the price scale');},change(value:boolean){invoke(this.flag().props.onChange,{target:{checked:value}});ui.settle();invoke(ui.find(node=>node.type==='button'&&text(node)==='Apply').props.onClick);ui.settle();expect(text(ui.render())).toContain('Applied.');sync();}};
}
const glyphs=(f:Fixture)=>f.paint().map(row=>row.values[0]).sort();
const values=(f:Fixture,surface:'legend'|'dataWindow')=>{const model=f.record().model,pane=f.native.scene.panes.get(model.paneId);return f.native.readoutRowsFor(model,f.rows.length-1,pane,surface).map((row:any)=>Number(row.value));};
function admitted(f:Fixture){const native=f.record().model.series[0];expect(native).toBeDefined();expect(native.id).toBeTypeOf('string');return{id:native.id,points:f.record().model.series.map((row:any)=>row.points.map((point:any)=>point.value))};}
it('active chart checkbox reaches real accepted native priceScale flags and glyphs without changing pane or other values',async()=>{
 const f=await fixture(),h=settings(f),before=admitted(f),view=f.view(),calls=f.workerCalls();expect(h.flag().props.checked).toBe(true);expect(glyphs(f)).toEqual(['16.00','19.00']);h.change(false);
 const native=f.record().model.series.find((row:any)=>row.id===before.id);expect(native).toBeDefined();expect(native.display.priceScale).toBe(false);expect(f.record().model.series.map((row:any)=>row.points.map((point:any)=>point.value))).toEqual(before.points);expect(f.record().model.series.every((row:any)=>row.display.pane===true)).toBe(true);expect(glyphs(f)).toEqual(['19.00']);expect(values(f,'legend')).toEqual([16,19]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(readScriptReadoutPosition(f.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual([16,19]);expect(()=>view.assertCurrent()).toThrow();expect(f.workerCalls()).toBe(calls);expect(restoreScriptBindings([h.saved])[0].plots['lvplot:First'].priceScale).toBe(false);
 h.change(true);expect(glyphs(f)).toEqual(['16.00','19.00']);expect(f.workerCalls()).toBe(calls);
});
it('inactive owned Settings drives the same actual Runtime native endpoint and painter path',async()=>{
 const f=await fixture(),h=settings(f,true),before=admitted(f),calls=f.workerCalls();expect(h.flag().props.checked).toBe(true);h.change(false);expect(f.record().model.series.find((row:any)=>row.id===before.id).display.priceScale).toBe(false);expect(glyphs(f)).toEqual(['19.00']);expect(values(f,'legend')).toEqual([16,19]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(f.workerCalls()).toBe(calls);h.change(true);expect(glyphs(f)).toEqual(['16.00','19.00']);expect(f.workerCalls()).toBe(calls);
});
it('global scale labels off withholds glyphs without destroying saved choices or checkbox capability',async()=>{
 const f=await fixture();f.display.setOptions({labelsVisible:false,valuesVisible:true});const h=settings(f),calls=f.workerCalls();expect(h.flag().props.checked).toBe(true);expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);expect(glyphs(f)).toEqual([]);h.change(false);const saved=structuredClone(h.saved);expect(saved.plots['lvplot:First'].priceScale).toBe(false);expect(saved.plots['lvplot:Second'].priceScale).toBe(true);expect(glyphs(f)).toEqual([]);f.display.setOptions({labelsVisible:true,valuesVisible:true});expect(glyphs(f)).toEqual(['19.00']);expect(h.saved).toEqual(saved);expect(f.binding.plots).toEqual(saved.plots);expect(values(f,'legend')).toEqual([16,19]);expect(values(f,'dataWindow')).toEqual([16,19]);expect(f.workerCalls()).toBe(calls);
});
it('axis-free placement keeps the supported saved option and scalar readiness without fabricating a glyph',async()=>{
 const f=await fixture();setIndicatorScalePlacement(f.chart,f.record().id,'none');const h=settings(f),calls=f.workerCalls();expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);expect(h.flag().props.checked).toBe(true);expect(glyphs(f)).toEqual([]);expect(f.view().state).toBe('ready');expect(readScriptReadoutPosition(f.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual([16,19]);h.change(false);expect(h.saved.plots['lvplot:First'].priceScale).toBe(false);expect(glyphs(f)).toEqual([]);expect(f.workerCalls()).toBe(calls);
});
