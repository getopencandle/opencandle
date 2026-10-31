import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {createLayoutPort,createLayoutSnapshot} from '../../src/chart/layout-port';
import {createMultiChartState,resizeMultiChartState,MultiChartGrid} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForInput,type ChartController,type ChartSourceContext} from '../../src/chart/adapter';
import {createMarketQueue} from '../../src/chart/market-queue';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import type {Bar} from '../../src/domain/types';
function controller(dataset=fixtureDataset('GME',3),fail=false){let loaded=dataset.bars,source=sourceContextForInput({datasetId:dataset.provenance.datasetId,revision:'1',fixture:true,label:'Synthetic',resolution:dataset.resolution},loaded);const queue=createMarketQueue({read:()=>({bars:loaded,source}),write:next=>{loaded=next.bars;source=next.source;},apply:async()=>{},disposed:()=>false,validate:()=>fail?{code:'UNAVAILABLE',feature:'review',severity:'unavailable',message:'Renderer unavailable'}:null});return {chart:{on:()=>()=>{},renderer:{onCrosshairMove:()=>()=>{}}},onDrawingsChanged:()=>()=>{},getSourceBars:()=>structuredClone(loaded),getSourceContext:()=>({...source}),setBarsWithRollback:(bars:Bar[],next:ChartSourceContext)=>queue.setWithRollback(bars,sourceContextForInput(next,bars)),setBars:(bars:Bar[],next:ChartSourceContext)=>queue.set(bars,sourceContextForInput(next,bars))} as unknown as ChartController;}
it('initial grid migration preserves independent viewport and per-type settings without sharing drafts',()=>{
 const settings={appearance:defaultTheme.appearance,viewport:{from:100,to:300},chartTypeSettings:{baseline:{baseLevel:37}}},state=createMultiChartState(fixtureDataset('GME',3),settings),cell=state.cells[state.layout.activeCellId];
 expect(cell.viewport).toEqual({from:100,to:300});expect(cell.chartTypeSettings).toEqual({baseline:{baseLevel:37}});
 settings.viewport.from=200;settings.chartTypeSettings.baseline.baseLevel=80;expect(cell.viewport!.from).toBe(100);expect(cell.chartTypeSettings!.baseline.baseLevel).toBe(37);
});
it('existing cells retain script source snapshots while new cells inherit detached first-chart bindings',()=>{
 const binding={id:'bound',documentId:'document',name:'Local example',source:'({onBar(ctx){ctx.plot("Close",ctx.bar.close,"#ffffff")}})',version:1,pane:'price' as const,visible:true,plots:{}},state=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,scriptBindings:[binding]}),id=state.layout.activeCellId;
 binding.source='Changed editor draft';expect(state.cells[id].scriptBindings![0].source).not.toBe(binding.source);const expanded=resizeMultiChartState(state,'two-rows');expect(expanded.cells[id].scriptBindings).toEqual(state.cells[id].scriptBindings);const inherited=expanded.cells[expanded.layout.cells[1].id].scriptBindings![0];expect(inherited).toMatchObject({...state.cells[id].scriptBindings![0],id:expect.any(String)});expect(inherited.id).not.toBe(state.cells[id].scriptBindings![0].id);expect(inherited).not.toBe(state.cells[id].scriptBindings![0]);
 const focus={...expanded,layout:{...expanded.layout,activeCellId:expanded.layout.cells[1].id,maximizedCellId:id}};expect(focus.cells[id].scriptBindings).toEqual(state.cells[id].scriptBindings);
});
it('two row and two column layout presets retain distinct geometry in the generated React artifact',()=>{
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 state.layout=createLayoutSnapshot(2,{cellIds:[id,'second']});state.cells.second=structuredClone(state.cells[id]);state.presetId='two-rows';
 const rows=renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:[dataset],onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
 expect(rows).toContain('grid-template-columns:repeat(1,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))');
 state.presetId='two-columns';const columns=renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:[dataset],onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
 expect(columns).toContain('grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(1,minmax(0,1fr))');
 expect(rows).toContain('position:relative;display:flex;flex-direction:column;flex:1;min-height:0');
});
it('linked source update rolls prior renderers back if a later renderer refuses its input',async()=>{
 const initial=fixtureDataset('GME',3),next=fixtureDataset('AAPL',3),layout=createLayoutSnapshot(2,{cellIds:['a','b']});layout.sync.symbol=true;
 const port=createLayoutPort(layout),first=controller(initial),second=controller(initial,true);port.mount('a',first);port.mount('b',second);
 await expect(port.setDataset('a',next)).rejects.toThrow('Renderer unavailable');expect(port.snapshot()).toEqual(layout);expect(first.getSourceBars()).toEqual(initial.bars);port.dispose();
});
it('linked interval updates retain declared resolution and trusted rollback restores the original immutable input identity',async()=>{
 const initial=fixtureDataset('GME',3),next=fixtureDataset('SPY',3);next.resolution='5m';const layout=createLayoutSnapshot(2,{cellIds:['a','b']});layout.sync.symbol=true;layout.sync.interval=true;
 const port=createLayoutPort(layout),first=controller(initial),second=controller(initial,true),token=first.getSourceContext().inputIdentity;port.mount('a',first);port.mount('b',second);
 await expect(port.setDataset('a',next)).rejects.toThrow('Renderer unavailable');expect(first.getSourceContext()).toMatchObject({inputIdentity:token,resolution:'1D',datasetId:initial.provenance.datasetId});expect(token).toBe(barInputIdentity(initial.bars));expect(port.snapshot()).toEqual(layout);
 const single=createLayoutPort(createLayoutSnapshot(1,{cellIds:['single']})),chart=controller(initial);single.mount('single',chart);await single.setDataset('single',next);expect(chart.getSourceContext()).toMatchObject({resolution:'5m',inputIdentity:barInputIdentity(next.bars)});port.dispose();single.dispose();
});
it('public market input cannot reuse a forged or previous identity for a corrected cloned array',async()=>{
 const initial=fixtureDataset('GME',3),chart=controller(initial),old=chart.getSourceContext(),corrected=structuredClone(initial.bars);corrected[0].close=corrected[0].open;
 await chart.setBars(corrected,{...old,inputIdentity:old.inputIdentity});expect(chart.getSourceContext().inputIdentity).toBe(barInputIdentity(corrected));expect(chart.getSourceContext().inputIdentity).not.toBe(old.inputIdentity);
});
it('queued layout changes cannot resolve out of order and leave the last selected symbol active',async()=>{
 const layout=createLayoutSnapshot(1,{cellIds:['a']}),port=createLayoutPort(layout),chart=controller();port.mount('a',chart);
 const a=fixtureDataset('AAPL',3),b=fixtureDataset('SPY',3),first=port.setDataset('a',a),second=port.setDataset('a',b);await Promise.all([first,second]);
 expect(port.snapshot().cells[0].symbol).toBe('SPY');expect(chart.getSourceBars()).toEqual(b.bars);port.dispose();
});
it('invalid saved layout identities and unsupported sync keys are rejected explicitly',()=>{
 const layout=createLayoutSnapshot(1,{cellIds:['a']});expect(()=>createLayoutPort({...layout,activeCellId:'missing'})).toThrow('Invalid layout snapshot');const port=createLayoutPort(layout);
 expect(()=>port.sync({invented:true} as any)).toThrow('Unknown sync setting');expect(port.snapshot()).toEqual(layout);port.dispose();
});
it('repeated resize discards removed cells, preserving retained independent state and theme identity',()=>{
 const initial=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,themeId:defaultTheme.id}),large=resizeMultiChartState(initial,'sixteen'),small=resizeMultiChartState(large,'two-rows'),expanded=resizeMultiChartState(small,'sixteen');
 expect(Object.keys(large.cells)).toHaveLength(16);expect(Object.keys(small.cells)).toHaveLength(2);expect(Object.keys(expanded.cells)).toHaveLength(16);expect(small.layout.cells.map(row=>row.id)).toEqual(large.layout.cells.slice(0,2).map(row=>row.id));
 expect(small.cells[small.layout.activeCellId].themeId).toBe(defaultTheme.id);expect(small.presetId).toBe('two-rows');expect(initial.layout.cells).toHaveLength(1);expect(()=>resizeMultiChartState(initial,'unknown')).toThrow();
});
it('a mismatched active prefix is withheld instead of being rendered under another source label',()=>{
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),markup=renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:[dataset],activeBars:fixtureDataset('SPY',3).bars,activeDatasetId:'wrong-source',onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
 expect(markup).toContain('Active history does not match this chart source');expect(markup).not.toContain('data-testid="chart-panel"');
});
