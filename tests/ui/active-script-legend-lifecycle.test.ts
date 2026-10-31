import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {ScriptLegendRows,ScriptSettingsDialog,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {scriptPresentationFixture,SYNTHETIC_BINDING,syntheticRows,syntheticResult,settle} from '../fixtures/script-presentation';
import {logicalScriptFixture,logicalSourceRows} from '../fixtures/script-derived-position';
import type {ScriptLegendContext} from '../../src/ui/script-legend-readout';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {scriptOutputs} from '../../src/ui/script-outputs';

let frames:Map<number,()=>void>,sequence:number;
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[],logical:Awaited<ReturnType<typeof logicalScriptFixture>>[]=[],mounted:Array<{dispose():void}>=[];
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const view of mounted.splice(0).reverse())view.dispose();for(const f of fixtures.splice(0).reverse())f.close();for(const f of logical.splice(0).reverse())f.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();};
async function fixture(){const f=scriptPresentationFixture();fixtures.push(f);f.runtime().update(f.context());f.complete();await settle();return f;}
const context=(value:Partial<ScriptLegendContext>={}):ScriptLegendContext=>({datasetId:'SYNTHETIC A',basisIdentity:'SYNTHETIC basis',inputIdentity:'live:SYNTHETIC lineage',style:'candles',execution:'ordinary',cellId:'SYNTHETIC cell',treeEpoch:1,...value});
function mount(port:ReturnType<typeof scriptPresentationFixture>['port'],bindings:ScriptLegendRowsProps['bindings']=[SYNTHETIC_BINDING],isCurrent:()=>boolean=()=>true){
 const markets=new Set<()=>void>(),viewports=new Set<()=>void>(),off={market:vi.fn(),viewport:vi.fn()},chart:any={scripts:port,onMarketApplied:(callback:()=>void)=>{markets.add(callback);return()=>{off.market();markets.delete(callback);};},onViewportChanged:(callback:()=>void)=>{viewports.add(callback);return()=>{off.viewport();viewports.delete(callback);};},getDataWindow:vi.fn(()=>{throw Error('Legend must not capture inspection.');}),getSourceBars:vi.fn(()=>{throw Error('Legend must not clone sources.');}),getCalculationBars:vi.fn(()=>{throw Error('Legend must not clone calculations.');})};
 const props:ScriptLegendRowsProps={chart,bindings,showValues:true,showTitles:true,position:{kind:'latest'},owner:{},context:context(),isCurrent,onBindingsChange:vi.fn(()=>true)};
 const ui=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(ui);ui.settle();const click=(label:string)=>invoke(ui.find(node=>node.props['aria-label']===label).props.onClick);
 return{chart,props,ui,off,markets,viewports,click,market(){for(const callback of [...markets])callback();},viewport(){for(const callback of [...viewports])callback();}};
}
const values=(tree:unknown)=>all(tree,node=>node.props['data-legend-values']==='true').map(text);
const dialog=(h:ReturnType<typeof mount>)=>h.ui.find(node=>node.type===ScriptSettingsDialog).props as unknown as Parameters<typeof ScriptSettingsDialog>[0];

it('recovers on same-owner readiness acknowledgment without an unrelated notification or per-hover acquisition',async()=>{
 const f=await fixture(),capture=vi.spyOn(f.port,'captureReadout');let ready=false;const h=mount(f.port,[SYNTHETIC_BINDING],()=>ready);expect(values(h.ui.render())).toEqual([]);expect(capture).not.toHaveBeenCalled();ready=true;expect(values(h.ui.settle())).toEqual(['11.00']);expect(capture).toHaveBeenCalledOnce();
 for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:index%2?100:220};h.ui.settle();}expect(capture).toHaveBeenCalledOnce();h.props.position={kind:'latest'};ready=false;h.ui.settle();expect(values(h.ui.render())).toEqual([]);ready=true;expect(values(h.ui.settle())).toEqual(['11.00']);expect(capture).toHaveBeenCalledTimes(2);
});

it('withholds old source values immediately and refreshes only after genuine corrected acceptance',async()=>{
 const f=await fixture(),h=mount(f.port),rows=syntheticRows();rows[1].close=17;f.publish(rows);h.market();expect(values(h.ui.render())).toEqual([]);f.runtime().update(f.context());f.complete(1,syntheticResult([[100,17],[160,null],[220,19]]));await settle();flush();expect(values(h.ui.settle())).toEqual(['19.00']);
});
it('does not revive an old ready view after native source ABA restoration',async()=>{
 const f=await fixture(),h=mount(f.port),original=f.core.bars;f.core.bars=[...original];expect(values(h.ui.render())).toEqual([]);f.core.bars=original;expect(values(h.ui.render())).toEqual([]);
});
it('reacquires current views for actual style pane and checkpoint restore operations',async()=>{
 const f=await fixture(),h=mount(f.port),snapshot=f.port.captureAcceptedResults();f.port.rename(SYNTHETIC_BINDING.id,'Synthetic renamed study');flush();expect(values(h.ui.settle())).toEqual(['11.00']);f.move();flush();expect(values(h.ui.settle())).toEqual(['11.00']);f.port.restoreAcceptedResults(snapshot);flush();expect(values(h.ui.settle())).toEqual(['11.00']);
});
it('keeps settings editable across actual live bar replacement and worker recomputation on the same lineage',async()=>{
 const f=await logicalScriptFixture({live:true});logical.push(f);await f.start();const h=mount(f.port,[f.binding]);h.props.context=context({...f.input.source,style:'renko'});h.ui.settle();h.click('Settings for '+f.binding.name);
 const before=dialog(h);expect(before.stylesUnavailableReason).toBeUndefined();const session=before.binding.id;
 await f.replace(logicalSourceRows([10,18,19]));h.props.owner={};h.props.context={...h.props.context!};h.market();h.ui.settle();expect(dialog(h).binding.id).toBe(session);expect(()=>dialog(h).assertOwner?.()).not.toThrow();await f.start();flush();h.ui.settle();const current=dialog(h);expect(()=>current.assertOwner?.()).not.toThrow();expect(current.onApply({inputs:undefined,plots:{}})).toBe(true);expect(h.props.onBindingsChange).toHaveBeenCalledOnce();
});
it('keeps a dialog applicable when live dataset bars and content revision all change together',async()=>{
 const f=scriptPresentationFixture({live:true});fixtures.push(f);const firstRows=syntheticRows();stampLiveLineage(firstRows,'SYNTHETIC active legend live stream',0);const firstDataset={...f.dataset,bars:firstRows,provenance:{...f.dataset.provenance,revision:'SYNTHETIC tick 1'}};f.publish(firstRows,sourceContextForDataset(firstDataset));f.runtime().update(f.context());f.complete();await settle();const h=mount(f.port);h.props.context=context({...f.input.source});h.ui.settle();h.click('Settings for '+SYNTHETIC_BINDING.name);const first=dialog(h);
 const nextRows=syntheticRows();nextRows[2].close=19;stampLiveLineage(nextRows,'SYNTHETIC active legend live stream',1);const nextDataset={...firstDataset,bars:nextRows,provenance:{...firstDataset.provenance,revision:'SYNTHETIC tick 2'}};expect(nextDataset).not.toBe(firstDataset);expect(nextRows).not.toBe(firstRows);f.publish(nextRows,sourceContextForDataset(nextDataset));h.props.owner={};h.props.context=context({...f.input.source});h.market();h.ui.settle();expect(()=>dialog(h).assertOwner?.()).not.toThrow();f.runtime().update(f.context());f.complete(1,syntheticResult([[100,7],[220,19]]));await settle();flush();h.ui.settle();expect(values(h.ui.render())).toEqual(['19.00']);expect(dialog(h).binding.id).toBe(first.binding.id);expect(dialog(h).onApply({inputs:undefined,plots:{}})).toBe(true);expect(h.props.onBindingsChange).toHaveBeenCalledOnce();
});
it('retains a dialog across numeric frame-owner changes without letting an old source context return',async()=>{
 const f=await fixture(),h=mount(f.port);h.click('Settings for '+SYNTHETIC_BINDING.name);const initial=dialog(h);h.props.owner={};h.props.context={...h.props.context!};h.ui.settle();expect(()=>dialog(h).assertOwner?.()).not.toThrow();h.props.context=context({datasetId:'SYNTHETIC B'});h.ui.settle();h.props.context=context();h.ui.settle();expect(all(h.ui.render(),node=>node.type===ScriptSettingsDialog)).toHaveLength(0);expect(()=>initial.assertOwner?.()).toThrow();
});
it('old chart A dialog callbacks cannot edit or close a replacement chart B dialog with the same script ID',async()=>{
 const a=await fixture(),b=await fixture(),h=mount(a.port),replacement=mount(b.port);h.click('Settings for '+SYNTHETIC_BINDING.name);const old=dialog(h);h.props.chart=replacement.chart;h.props.owner={};h.props.context=context({datasetId:'SYNTHETIC B'});h.ui.settle();h.click('Settings for '+SYNTHETIC_BINDING.name);expect(()=>old.onApply({inputs:undefined,plots:{}})).toThrow();old.onClose();expect(all(h.ui.settle(),node=>node.type===ScriptSettingsDialog)).toHaveLength(1);expect(h.props.onBindingsChange).not.toHaveBeenCalled();
});
it('source context ABA observed before effects cannot revive a detached dialog callback',async()=>{
 const f=await fixture(),h=mount(f.port);h.click('Settings for '+SYNTHETIC_BINDING.name);const old=dialog(h),original=h.props.context;h.props.context=context({style:'heikinashi'});h.ui.render();h.props.context=original;h.ui.render();expect(()=>old.assertOwner?.()).toThrow();expect(all(h.ui.settle(),node=>node.type===ScriptSettingsDialog)).toHaveLength(0);
});
it('fast binding/library source ABA cannot revive a dialog or detached row command before effects',async()=>{
 const f=await fixture(),h=mount(f.port);h.click('Settings for '+SYNTHETIC_BINDING.name);const old=dialog(h),hide=h.ui.find(node=>node.props['aria-label']==='Hide '+SYNTHETIC_BINDING.name).props.onClick,original=h.props.bindings;
 h.props.bindings=[{...SYNTHETIC_BINDING,source:'({onBar(){/* Synthetic edited library source. */}})'}];h.ui.render();h.props.bindings=original;h.ui.render();expect(()=>old.onApply({inputs:undefined,plots:{}})).toThrow();invoke(hide);expect(h.props.onBindingsChange).not.toHaveBeenCalled();expect(all(h.ui.settle(),node=>node.type===ScriptSettingsDialog)).toHaveLength(0);
});
it('uses owned human style metadata without a script list clone and preserves saved styles when metadata is unavailable',async()=>{
 const f=await fixture(),h=mount(f.port),list=vi.spyOn(f.port,'list');h.click('Settings for '+SYNTHETIC_BINDING.name);const shown=dialog(h);expect(shown.plotTitles).toEqual({'lvplot:Value':'Value'});expect(shown.renderedPlots['lvplot:Value'].color).toBe('#123456');expect(list).not.toHaveBeenCalled();shown.onClose();h.ui.settle();vi.spyOn(f.port,'presentationMetadata').mockReturnValue([]);h.click('Settings for '+SYNTHETIC_BINDING.name);expect(dialog(h).stylesUnavailableReason).toContain('Saved styles are retained');expect(dialog(h).renderedPlots).toEqual({});expect(list).not.toHaveBeenCalled();
});
it('keeps Hide Remove and workspace refusal functional with unavailable scalar authority',async()=>{
 const f=await fixture(),h=mount(f.port);h.props.position={kind:'unavailable'};h.click('Hide '+SYNTHETIC_BINDING.name);expect(h.props.onBindingsChange).toHaveBeenLastCalledWith([{...SYNTHETIC_BINDING,visible:false}]);h.click('Remove script '+SYNTHETIC_BINDING.name);expect(h.props.onBindingsChange).toHaveBeenLastCalledWith([]);h.props.onBindingsChange=vi.fn(()=>false);h.click('Hide '+SYNTHETIC_BINDING.name);expect(text(h.ui.render())).toContain('The workspace refused this change.');
});
it('rejects stale binding callbacks after a settings replacement and retains its successful Apply session',async()=>{
 const f=await fixture(),h=mount(f.port);h.props.onBindingsChange=vi.fn(next=>{h.props.bindings=next;return true;});h.ui.settle();h.click('Settings for '+SYNTHETIC_BINDING.name);const first=dialog(h),oldHide=h.ui.find(node=>node.props['aria-label']==='Hide '+SYNTHETIC_BINDING.name).props.onClick;
 expect(first.onApply({inputs:{length:3},plots:{}})).toBe(true);h.ui.settle();expect(()=>dialog(h).assertOwner?.()).not.toThrow();invoke(oldHide);expect(h.props.onBindingsChange).toHaveBeenCalledTimes(1);first.onClose();expect(all(h.ui.settle(),node=>node.type===ScriptSettingsDialog)).toHaveLength(0);
});
it('one thousand cursor renders do no history clones metadata reads serialization or worker work',async()=>{
 const f=await fixture(),h=mount(f.port),list=vi.spyOn(f.port,'list'),metadata=vi.spyOn(f.port,'presentationMetadata'),capture=vi.spyOn(f.port,'captureReadout'),clone=vi.spyOn(globalThis,'structuredClone'),json=vi.spyOn(JSON,'stringify'),barReads=f.barReads;
 try{for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:index%2?100:220};expect(values(h.ui.render())).toEqual([index%2?'7.00':'11.00']);}expect(list).not.toHaveBeenCalled();expect(metadata).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();expect(h.chart.getDataWindow).not.toHaveBeenCalled();expect(h.chart.getSourceBars).not.toHaveBeenCalled();expect(h.chart.getCalculationBars).not.toHaveBeenCalled();expect(f.barReads).toBe(barReads);expect(f.pending).toHaveLength(1);}finally{list.mockRestore();metadata.mockRestore();capture.mockRestore();clone.mockRestore();json.mockRestore();}
});
it('an open actual Settings dialog also renders one thousand cursors without declaration serialization',async()=>{
 const f=await fixture(),h=mount(f.port);h.click('Settings for '+SYNTHETIC_BINDING.name);let settingsProps=dialog(h);const settings=mountControlledComponent(()=>ScriptSettingsDialog(settingsProps));mounted.push(settings);settings.settle();const json=vi.spyOn(JSON,'stringify');
 try{for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:index%2?100:220};h.ui.render();settingsProps=dialog(h);settings.render();}expect(json).not.toHaveBeenCalled();expect(()=>dialog(h).assertOwner?.()).not.toThrow();}finally{json.mockRestore();}
});
it('preserves edited numeric text boolean and plot-style drafts through accepted clone-equal and unrelated metadata publications',async()=>{
 const f=scriptPresentationFixture({live:true});fixtures.push(f);const firstRows=syntheticRows();stampLiveLineage(firstRows,'SYNTHETIC draft live stream',0);const firstDataset={...f.dataset,bars:firstRows,provenance:{...f.dataset.provenance,revision:'SYNTHETIC draft tick 1'}};
 const result=syntheticResult();result.declarations={inputs:[{id:'count',type:'int',title:'Synthetic count',default:2,min:1,max:99,step:1,options:null},{id:'note',type:'string',title:'Synthetic note',default:'Initial text',min:null,max:null,step:null,options:null},{id:'enabled',type:'bool',title:'Synthetic enabled',default:false,min:null,max:null,step:null,options:null}],requests:[]};result.inputs={count:2,note:'Initial text',enabled:false};
 f.publish(firstRows,sourceContextForDataset(firstDataset));f.runtime().update(f.context());f.complete(0,result);await settle();const h=mount(f.port);h.props.context=context({...f.input.source});h.ui.settle();h.click('Settings for '+SYNTHETIC_BINDING.name);h.ui.settle();let settingsProps=dialog(h);const settings=mountControlledComponent(()=>ScriptSettingsDialog(settingsProps));mounted.push(settings);settings.settle();
 const field=(label:string)=>settings.find(node=>node.type==='input'&&node.props['aria-label']===label),tab=(name:string)=>{invoke(settings.find(node=>node.type==='button'&&text(node)===name).props.onClick);settings.settle();};
 invoke(field('Synthetic count').props.onChange,{target:{value:'7'}});invoke(field('Synthetic note').props.onChange,{target:{value:'Unsaved owner text'}});invoke(field('Synthetic enabled').props.onChange,{target:{checked:true}});settings.settle();tab('Style');invoke(field('Value color').props.onChange,{target:{value:'#abcdef'}});invoke(field('Value width').props.onChange,{target:{value:'3'}});settings.settle();
 const assertDraft=()=>{tab('Inputs');expect(field('Synthetic count').props.value).toBe('7');expect(field('Synthetic note').props.value).toBe('Unsaved owner text');expect(field('Synthetic enabled').props.checked).toBe(true);tab('Style');expect(field('Value color').props.value).toBe('#abcdef');expect(field('Value width').props.value).toBe(3);};
 const nextRows=syntheticRows();nextRows[2].close=19;stampLiveLineage(nextRows,'SYNTHETIC draft live stream',1);const nextDataset={...firstDataset,bars:nextRows,provenance:{...firstDataset.provenance,revision:'SYNTHETIC draft tick 2'}};f.publish(nextRows,sourceContextForDataset(nextDataset));h.props.owner={};h.props.context=context({...f.input.source});f.runtime().update(f.context());f.complete(1,structuredClone(result));await settle();flush();h.ui.settle();settingsProps=dialog(h);settings.settle();assertDraft();
 const accepted=scriptOutputs.get(f.port,SYNTHETIC_BINDING.id)!;scriptOutputs.publish(f.port,structuredClone(accepted));h.ui.settle();settingsProps=dialog(h);settings.settle();assertDraft();const unrelated={};scriptOutputs.publish(unrelated,{...structuredClone(accepted),bindingId:'SYNTHETIC unrelated script',title:'Synthetic unrelated study'});h.ui.settle();settingsProps=dialog(h);settings.settle();assertDraft();scriptOutputs.clear(unrelated);
 const json=vi.spyOn(JSON,'stringify');try{for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:index%2?100:220};h.ui.render();settingsProps=dialog(h);settings.render();}expect(json).not.toHaveBeenCalled();}finally{json.mockRestore();}
 invoke(settings.find(node=>node.type==='form').props.onSubmit,{preventDefault(){}});expect(h.props.onBindingsChange).toHaveBeenCalledOnce();expect((h.props.onBindingsChange as any).mock.calls[0][0][0]).toMatchObject({inputs:{count:7,note:'Unsaved owner text',enabled:true},plots:{'lvplot:Value':{color:'#abcdef',width:3}}});
});
it('cancels queued frames releases subscriptions and ignores callbacks captured before disposal',async()=>{
 const f=await fixture(),h=mount(f.port),old=[...h.markets],hide=h.ui.find(node=>node.props['aria-label']==='Hide '+SYNTHETIC_BINDING.name).props.onClick;h.viewport();expect(frames.size).toBe(1);h.ui.dispose();expect(frames.size).toBe(0);expect(h.off.market).toHaveBeenCalledOnce();expect(h.off.viewport).toHaveBeenCalledOnce();for(const callback of old)callback();invoke(hide);expect(h.props.onBindingsChange).not.toHaveBeenCalled();expect(frames.size).toBe(0);
});
it('cleans up acquired subscriptions if a later subscription fails',async()=>{
 const f=await fixture(),h=mount(f.port);h.ui.dispose();const release=vi.fn(),subscribe=vi.spyOn(f.port,'subscribe').mockReturnValue(release),chart:any={scripts:f.port,onMarketApplied(){throw Error('Synthetic subscribe failure.');}};const props:ScriptLegendRowsProps={chart,bindings:[SYNTHETIC_BINDING],showValues:true,position:{kind:'latest'},onBindingsChange:()=>true},ui=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(ui);expect(text(ui.settle())).toContain('Study updates are temporarily unavailable.');expect(release).toHaveBeenCalledOnce();subscribe.mockRestore();
});

it('title-only fresh literal bindings settle without scalar capture and Settings reads current metadata on demand',async()=>{
 const f=await fixture(),rendered=f.port.presentationMetadata!().find(row=>row.id===SYNTHETIC_BINDING.id)!.renderedPlots['lvplot:Value'],capture=vi.spyOn(f.port,'captureReadout'),metadata=vi.spyOn(f.port,'presentationMetadata'),chart:any={scripts:f.port};let showTitles=false;
 const ui=mountControlledComponent(()=>ScriptLegendRows({chart,bindings:[SYNTHETIC_BINDING],showTitles,onBindingsChange:()=>true}));mounted.push(ui);expect(text(ui.settle())).not.toContain(SYNTHETIC_BINDING.name);expect(all(ui.render(),node=>node.props['aria-label']==='Remove script '+SYNTHETIC_BINDING.name)).toHaveLength(1);expect(capture).not.toHaveBeenCalled();expect(metadata).toHaveBeenCalledOnce();
 showTitles=true;expect(text(ui.settle())).toContain(SYNTHETIC_BINDING.name);for(let index=0;index<1000;index++)ui.render();expect(capture).not.toHaveBeenCalled();expect(metadata).toHaveBeenCalledOnce();
 f.port.style(SYNTHETIC_BINDING.id,{'lvplot:Value':{...rendered,color:'#abcdef'}});invoke(ui.find(node=>node.props['aria-label']==='Settings for '+SYNTHETIC_BINDING.name).props.onClick);ui.settle();const settings=ui.find(node=>node.type===ScriptSettingsDialog).props as unknown as Parameters<typeof ScriptSettingsDialog>[0];expect(settings.renderedPlots['lvplot:Value'].color).toBe('#abcdef');expect(settings.stylesUnavailableReason).toBeUndefined();expect(()=>settings.assertOwner?.()).not.toThrow();expect(metadata).toHaveBeenCalledTimes(2);expect(capture).not.toHaveBeenCalled();ui.dispose();expect(frames.size).toBe(0);
});
