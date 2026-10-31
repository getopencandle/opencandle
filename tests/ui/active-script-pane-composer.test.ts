import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {ScriptLegendRows,ScriptSettingsDialog,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {groupActiveStudyPaneRows,type ScriptLegendOwnedRow,type ActiveLegendNode} from '../../src/ui/active-study-pane-rows';
import {scriptPresentationFixture,SYNTHETIC_BINDING,settle} from '../fixtures/script-presentation';

// Genuine accepted private-port metadata/readouts under a controlled hook model.
// No browser geometry, source capture, public fallback or synthetic scalar view.
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[],mounted:Array<{dispose():void}>=[];let frames:Map<number,()=>void>,sequence:number;
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();for(const f of fixtures.splice(0).reverse())f.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();};
async function fixture(){const f=scriptPresentationFixture();fixtures.push(f);f.runtime().update(f.context());f.complete();await settle();return f;}
const context=(datasetId='SYNTHETIC A')=>({datasetId,inputIdentity:'SYNTHETIC input',basisIdentity:'SYNTHETIC basis',style:'candles',execution:'ordinary',cellId:'SYNTHETIC cell',treeEpoch:1});
function mount(f:ReturnType<typeof scriptPresentationFixture>,showValues=false){
 const builtin=React.createElement('div',{'data-legend-row':'SYNTHETIC builtin'},'Builtin'),chart:any={scripts:f.port};let descriptors:readonly ScriptLegendOwnedRow[]=[];
 const renderNodes=(rows:readonly ActiveLegendNode[])=>rows.map(row=>React.createElement(React.Fragment,{key:row.key},row.node));
 const compose=(rows:readonly ScriptLegendOwnedRow[])=>{descriptors=rows;const grouped=groupActiveStudyPaneRows([{id:'SYNTHETIC builtin',paneId:'price',node:builtin}],rows);return React.createElement(React.Fragment,null,React.createElement('div',{'data-legend-pane':'price'},renderNodes(grouped.price)),...grouped.panes.map(group=>React.createElement('div',{key:group.paneId,'data-legend-pane':group.paneId},renderNodes(group.rows))),grouped.unplaced.length?React.createElement('div',{'data-study-placement':'unavailable'},'Placement unavailable',renderNodes(grouped.unplaced)):null);};
 const props:ScriptLegendRowsProps={chart,bindings:f.bindings,showTitles:true,showValues,position:{kind:'latest'},owner:{},context:context(),isCurrent:()=>true,onBindingsChange:vi.fn(()=>true),composeRows:compose};const ui=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(ui);ui.settle();
 return{ui,props,compose,get descriptors(){return descriptors;},click(label:string){invoke(ui.find(node=>node.props['aria-label']===label).props.onClick);ui.settle();}};
}
const scriptPanes=(tree:unknown)=>all(tree,node=>typeof node.props['data-legend-pane']==='string').filter(pane=>all(pane,node=>node.props['data-legend-script']===SYNTHETIC_BINDING.id).length).map(pane=>pane.props['data-legend-pane']);

it('a genuine metadata-only pane move updates composed rows with global values off and no scalar capture',async()=>{
 const f=await fixture(),capture=vi.spyOn(f.port,'captureReadout'),h=mount(f);expect(scriptPanes(h.ui.render())).toEqual(['price']);f.move();flush();expect(scriptPanes(h.ui.settle())).toEqual(['synthetic-other-pane']);expect(h.descriptors[0].actualPaneId).toBe('synthetic-other-pane');expect(all(h.ui.render(),node=>node.props['data-legend-pane']==='price')).toHaveLength(1);expect(capture).not.toHaveBeenCalled();
});
it('clone-equal metadata publications do not force title-only state writes or reacquire scalar views',async()=>{
 const f=await fixture(),capture=vi.spyOn(f.port,'captureReadout'),h=mount(f),writes=h.ui.owner.writes;f.port.rename(SYNTHETIC_BINDING.id,'Synthetic metadata title');flush();expect(h.ui.owner.writes).toBe(writes);expect(scriptPanes(h.ui.settle())).toEqual(['price']);expect(capture).not.toHaveBeenCalled();
});
it('numeric frame owner renewal preserves semantic placement without title-only revision writes',async()=>{
 const f=await fixture(),capture=vi.spyOn(f.port,'captureReadout'),h=mount(f),writes=h.ui.owner.writes;h.props.owner={};expect(scriptPanes(h.ui.settle())).toEqual(['price']);expect(h.ui.owner.writes).toBe(writes);expect(capture).not.toHaveBeenCalled();
});
it('current placement loss is an unavailable group rather than a requested price-pane fallback',async()=>{
 const f=await fixture(),metadata=vi.spyOn(f.port,'presentationMetadata').mockReturnValue([]),h=mount(f);expect(scriptPanes(h.ui.render())).toEqual([]);expect(h.descriptors[0].actualPaneId).toBeNull();expect(text(h.ui.render())).toContain('Placement unavailable');expect(all(h.ui.render(),node=>node.props['data-study-placement']==='unavailable')).toHaveLength(1);metadata.mockRestore();f.port.rename(SYNTHETIC_BINDING.id,'Synthetic recovered metadata');flush();expect(scriptPanes(h.ui.settle())).toEqual(['price']);
});
it('a native-only pane move keeps the same Settings session and its owned actions applicable',async()=>{
 const f=await fixture(),h=mount(f,true);h.click('Settings for '+SYNTHETIC_BINDING.name);const before=h.ui.find(node=>node.type===ScriptSettingsDialog).props as unknown as Parameters<typeof ScriptSettingsDialog>[0];f.move();flush();h.ui.settle();const after=h.ui.find(node=>node.type===ScriptSettingsDialog).props as unknown as Parameters<typeof ScriptSettingsDialog>[0];expect(scriptPanes(h.ui.render())).toEqual(['synthetic-other-pane']);expect(after.binding.id).toBe(before.binding.id);expect(()=>after.assertOwner?.()).not.toThrow();expect(after.onApply({inputs:undefined,plots:{}})).toBe(true);expect(h.props.onBindingsChange).toHaveBeenCalledOnce();
});
it('one thousand composed cursor renders retain genuine scalar values without metadata/history acquisition',async()=>{
 const f=await fixture(),h=mount(f,true),metadata=vi.spyOn(f.port,'presentationMetadata'),capture=vi.spyOn(f.port,'captureReadout'),list=vi.spyOn(f.port,'list'),clone=vi.spyOn(globalThis,'structuredClone'),json=vi.spyOn(JSON,'stringify'),barReads=f.barReads;
 try{for(let index=0;index<1000;index++){h.props.position={kind:'axis-time',time:index%2?100:220};h.props.composeRows=rows=>h.compose(rows);expect(all(h.ui.settle(),node=>node.props['data-legend-values']==='true').map(text)).toEqual([index%2?'7.00':'11.00']);}expect(metadata).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();expect(f.barReads).toBe(barReads);expect(f.pending).toHaveLength(1);}finally{metadata.mockRestore();capture.mockRestore();list.mockRestore();clone.mockRestore();json.mockRestore();}
});
it('source-context ABA hides old placement immediately and cannot revive detached Settings commands',async()=>{
 const f=await fixture(),h=mount(f);h.click('Settings for '+SYNTHETIC_BINDING.name);const old=h.ui.find(node=>node.type===ScriptSettingsDialog).props as unknown as Parameters<typeof ScriptSettingsDialog>[0];h.props.context=context('SYNTHETIC B');expect(scriptPanes(h.ui.render())).toEqual([]);h.props.context=context();expect(scriptPanes(h.ui.render())).toEqual([]);expect(()=>old.onApply({inputs:undefined,plots:{}})).toThrow();h.ui.settle();expect(scriptPanes(h.ui.render())).toEqual(['price']);expect(all(h.ui.render(),node=>node.type===ScriptSettingsDialog)).toEqual([]);
});
it('cleanup cancels its placement frame and ignores old port callbacks after disposal',async()=>{
 const f=await fixture(),h=mount(f),callbacks:Array<()=>void>=[],subscribe=vi.spyOn(f.port,'subscribe').mockImplementation(callback=>{callbacks.push(callback);return()=>false;});h.props.owner={};h.ui.settle();f.move();for(const callback of callbacks)callback();expect(frames.size).toBeGreaterThan(0);h.ui.dispose();expect(frames.size).toBe(0);for(const callback of callbacks)callback();expect(frames.size).toBe(0);subscribe.mockRestore();
});
