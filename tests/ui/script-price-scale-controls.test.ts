import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {scriptPresentationFixture,syntheticResult,settle} from '../fixtures/script-presentation';
import {ScriptLegendRows,ScriptSettingsDialog,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {CellScriptSettings} from '../../src/ui/CellStudyLegend';
import {applyScriptSettings} from '../../src/ui/script-settings-model';
import {restoreScriptBindings,type ScriptBinding} from '../../src/ui/script-library';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {scriptOutputs} from '../../src/ui/script-outputs';
import {liveLineageOf,stampLiveLineage} from '../../src/chart/bar-input-identity';
import * as proof from '../../src/chart/script-presentation-proof';

type Fixture=ReturnType<typeof scriptPresentationFixture>;type DialogProps=Parameters<typeof ScriptSettingsDialog>[0];
const owned:Fixture[]=[],mounted:Array<{dispose():void}>=[];let frames:Map<number,()=>void>,sequence:number;
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();for(const f of owned.splice(0).reverse())f.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(live=false){const f=scriptPresentationFixture({live});owned.push(f);if(live){const initial=f.input.bars.map(row=>({...row}));stampLiveLineage(initial,f.input.source.datasetId+'|'+f.input.source.revision,1);f.publish(initial);}const result=syntheticResult(),first=result.plots[0];result.plots=[{...first,id:'lvplot:First',title:'Equal label'},{...first,id:'lvplot:Second',title:'Equal label',values:first.values.map(point=>({...point,value:point.value===null?null:point.value+3}))}];f.runtime().update(f.context());f.complete(0,result);await settle();return f;}
function context(f:Fixture,datasetId=f.input.source.datasetId){return{datasetId,basisIdentity:f.input.source.basisIdentity,inputIdentity:f.input.source.inputIdentity,resolution:f.input.source.resolution,style:'candles',execution:'ordinary',cellId:'SYNTHETIC A',treeEpoch:1};}
function childDialog(parent:ReturnType<typeof mountControlledComponent>){
 let props=parent.find(node=>node.type===ScriptSettingsDialog).props as unknown as DialogProps;const ui=mountControlledComponent(()=>ScriptSettingsDialog(props));mounted.push(ui);ui.settle();
 const refresh=()=>{parent.settle();const rows=all(parent.render(),node=>node.type===ScriptSettingsDialog);if(rows.length){props=rows[0].props as unknown as DialogProps;ui.settle();}};
 const click=(label:string)=>{invoke(ui.find(node=>node.type==='button'&&text(node)===label).props.onClick);ui.settle();refresh();};click('Style');
 const groups=()=>all(ui.render(),node=>node.type==='fieldset'),flags=(root:unknown=ui.render())=>all(root,node=>node.type==='input'&&typeof node.props['aria-label']==='string'&&(node.props['aria-label'] as string).endsWith(' labels on the price scale'));
 return{ui,refresh,click,groups,flags,get props(){return props;},change(index:number,value:boolean){const field=flags(groups()[index]);expect(field).toHaveLength(1);invoke(field[0].props.onChange,{target:{checked:value}});ui.settle();},submit(){invoke(ui.find(node=>node.type==='form').props.onSubmit,{preventDefault(){}});ui.settle();refresh();}};
}
function active(f:Fixture,port:unknown=f.port){
 let current=true;const publish=vi.fn((next:ScriptBinding[])=>{f.setBindings(next);props.bindings=next;f.runtime().update(f.context());return true;});
 const props:ScriptLegendRowsProps={chart:{scripts:port}as any,bindings:f.bindings,owner:{},context:context(f),showTitles:true,showValues:false,isCurrent:()=>current,onBindingsChange:publish};const parent=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(parent);parent.settle();invoke(parent.find(node=>node.props['aria-label']==='Settings for '+f.bindings[0].name).props.onClick);parent.settle();const child=childDialog(parent);
 return{...child,parent,props,publish,setCurrent(value:boolean){current=value;},get saved(){return f.bindings[0];}};
}
function inactive(f:Fixture){
 let current=true;const apply=vi.fn((change:Parameters<DialogProps['onApply']>[0])=>{const next=applyScriptSettings(f.bindings,f.bindings[0].id,change);f.setBindings(next);props.binding=next[0];f.runtime().update(f.context());return true;}),close=vi.fn();
 const props:Parameters<typeof CellScriptSettings>[0]={chart:{scripts:f.port}as any,binding:f.bindings[0],assertOwner:()=>{if(!current)throw Error('Synthetic inactive owner retired');},onApply:apply,onClose:close};const parent=mountControlledComponent(()=>CellScriptSettings(props));mounted.push(parent);parent.settle();return{...childDialog(parent),parent,props,apply,close,setCurrent(value:boolean){current=value;},get saved(){return f.bindings[0];}};
}
it('active chart-opened Settings exposes numeric price-scale flags through genuine private capability',async()=>{
 const f=await fixture(),h=active(f);expect(h.flags()).toHaveLength(2);expect(h.flags().map(node=>node.props.checked)).toEqual([true,true]);expect(text(h.ui.render())).toContain('Labels on the price scale');expect(h.props.chart).not.toBe(f.chart);expect(h.publish).not.toHaveBeenCalled();expect(text(h.ui.render())).not.toContain('lvplot:');
});
it('inactive chart Settings captures the same genuine capability once despite fresh owner callback props',async()=>{
 const f=await fixture(),capability=vi.spyOn(proof,'scriptPriceScaleControlsAvailable'),h=inactive(f);expect(h.flags()).toHaveLength(2);expect(capability).toHaveBeenCalledOnce();for(let index=0;index<20;index++){h.props.assertOwner=()=>{};h.refresh();}expect(capability).toHaveBeenCalledOnce();expect(h.flags()).toHaveLength(2);h.change(0,false);h.click('Apply');expect(h.apply).toHaveBeenCalledOnce();expect(h.saved.plots['lvplot:First'].priceScale).toBe(false);
});
it('an unsupported copied port keeps existing style controls and saved flags without offering price-scale edits',async()=>{
 const f=await fixture(),h=active(f,{...f.port});expect(h.flags()).toEqual([]);expect(text(h.ui.render())).toContain('Values in the status line');expect(text(h.ui.render())).toContain('Values in the Data Window');expect(text(h.ui.render())).not.toContain('Labels on the price scale');h.click('Apply');expect(Object.values(h.saved.plots).every(style=>style.priceScale)).toBe(true);
});
it('only current numeric rendered IDs qualify while hline fill and saved-only orphan styles do not',async()=>{
 const f=await fixture(),extra=defaultPlotStyle('sma','synthetic',0);f.setBindings([{...f.bindings[0],plots:{'lvplot:Orphan':extra,'lvhline:Level':extra,'lvfill:Band':extra}}]);f.runtime().update(f.context());const h=active(f);expect(h.groups()).toHaveLength(5);expect(h.flags()).toHaveLength(2);for(const group of h.groups().slice(2))expect(h.flags(group)).toEqual([]);expect(all(h.ui.render(),node=>node.type==='legend').map(text)).toEqual(['Equal label','Equal label','Plot style','Line: Level','Fill: Band']);
});
it('duplicate human labels keep independent stable plot choices without exposing internal IDs',async()=>{
 const f=await fixture(),h=active(f);expect(h.groups().map(node=>(node as unknown as {key:string}).key)).toEqual(['lvplot:First','lvplot:Second']);h.change(0,false);h.click('Apply');expect(h.saved.plots['lvplot:First'].priceScale).toBe(false);expect(h.saved.plots['lvplot:Second'].priceScale).toBe(true);expect(text(h.ui.render())).not.toContain('lvplot:');expect(h.flags().map(node=>node.props['aria-label'])).toEqual(['Equal label labels on the price scale','Equal label labels on the price scale']);
});
it('Cancel discards checkbox drafts and reopening reads the saved choices',async()=>{
 const f=await fixture(),h=active(f);h.change(0,false);h.click('Cancel');expect(h.publish).not.toHaveBeenCalled();const reopened=active(f);expect(reopened.flags().map(node=>node.props.checked)).toEqual([true,true]);
});
it('Apply and Ok persist restored choices while preserving open and close behavior',async()=>{
 const f=await fixture(),h=active(f);h.change(0,false);h.click('Apply');expect(h.publish).toHaveBeenCalledOnce();expect(all(h.parent.render(),node=>node.type===ScriptSettingsDialog)).toHaveLength(1);const restored=restoreScriptBindings(f.bindings);expect(restored[0].plots['lvplot:First'].priceScale).toBe(false);f.setBindings(restored);const reopened=active(f);expect(reopened.flags().map(node=>node.props.checked)).toEqual([false,true]);reopened.change(1,false);reopened.submit();expect(reopened.publish).toHaveBeenCalledOnce();expect(all(reopened.parent.render(),node=>node.type===ScriptSettingsDialog)).toEqual([]);expect(Object.values(reopened.saved.plots).every(style=>!style.priceScale)).toBe(true);
});
it('Defaults restores current rendered checkbox values and publishes only after Apply',async()=>{
 const f=await fixture(),h=active(f);h.change(0,false);h.click('Defaults');expect(h.publish).not.toHaveBeenCalled();expect(h.flags().map(node=>node.props.checked)).toEqual([true,true]);h.click('Apply');expect(h.publish).toHaveBeenCalledOnce();expect(h.saved.plots['lvplot:First'].priceScale).toBe(true);
});
it('source and inactive owner retirement prevent detached checkbox callbacks from publishing across A B A',async()=>{
 const f=await fixture(),h=active(f);h.change(0,false);const old=h.props.context;h.props.context=context(f,'SYNTHETIC B');h.parent.render();h.props.context=old;h.parent.render();h.click('Apply');expect(h.publish).not.toHaveBeenCalled();expect(text(h.ui.render())).toMatch(/changed|again/);const other=inactive(f);other.change(0,false);other.setCurrent(false);other.click('Apply');expect(other.apply).not.toHaveBeenCalled();expect(text(other.ui.render())).toContain('Synthetic inactive owner retired');
});
it('live ticks clone-equal bindings and unrelated publication preserve draft without hover capability recapture',async()=>{
 const f=await fixture(true),capability=vi.spyOn(proof,'scriptPriceScaleControlsAvailable'),h=active(f);h.change(0,false);const original=f.input.bars,lineage=liveLineageOf(original)!;expect(lineage).not.toBeNull();const next=original.map(row=>({...row,close:row.close+1}));stampLiveLineage(next,lineage.key,lineage.seq+1);f.publish(next);f.runtime().update(f.context());const result=syntheticResult(),base=result.plots[0];result.plots=[{...base,id:'lvplot:First',title:'Equal label'},{...base,id:'lvplot:Second',title:'Equal label'}];f.complete(1,result);await settle();h.props.owner={};const clones=f.bindings.map(binding=>({...binding,plots:{...binding.plots}}));f.setBindings(clones);h.props.bindings=clones;const entry=scriptOutputs.get(f.port,clones[0].id)!;expect(entry).not.toBeNull();scriptOutputs.publish(f.port,structuredClone(entry));scriptOutputs.publish({}, {...entry,bindingId:'SYNTHETIC unrelated'});for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:100+index};h.refresh();}expect(h.flags().map(node=>node.props.checked)).toEqual([false,true]);expect(capability).toHaveBeenCalledOnce();expect(h.publish).not.toHaveBeenCalled();
});
