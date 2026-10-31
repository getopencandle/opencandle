import {expect,it} from 'vitest';
import {createMultiChartState,resizeMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import type {IndicatorSnapshot} from '../../src/chart/indicator-settings';

const plot={visible:false,color:'#c470af',width:3,lineStyle:'dashed' as const,kind:'line' as const,priceScale:false,legend:true,dataWindow:false};
const rsi:IndicatorSnapshot={id:'first-rsi',kind:'rsi',inputs:{length:7,source:'high'},plots:{rsi:plot},offset:2,visible:false,paneId:'shared-pane'};
function input():MultiChartState{
 const first=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,indicators:[structuredClone(rsi)],scriptBindings:[{id:'first-script',documentId:'saved-document',version:3,name:'Synthetic reference study',source:'({onBar(ctx){ctx.plot("value",ctx.bar.close)}})',pane:'new',paneId:'shared-pane',ownScale:true,visible:false,plots:{value:structuredClone(plot)}}]});
 const second=structuredClone(first.cells[first.layout.activeCellId]);second.indicators=[{...structuredClone(rsi),id:'active-ema',kind:'ema',inputs:{length:21,source:'low'},plots:{ema:{...plot,visible:true}},paneId:'price'}];second.scriptBindings=[];second.style='line';second.appearance.background='#aabbcc';second.chartOptions={source:'open',scale:'logarithmic',invert:true,auto:false,timezone:'America/Phoenix'} as typeof second.chartOptions;second.viewport={from:10,to:20};second.chartTypeSettings={baseline:{baseLevel:37}};first.layout.cells.push({...first.layout.cells[0],id:'active-second'});first.cells['active-second']=second;first.layout.activeCellId='active-second';first.presetId='two-columns';return first;
}
it('new charts inherit the first chart study settings with detached instance and shared-pane identities',()=>{
 const before=input(),snapshot=structuredClone(before),after=resizeMultiChartState(before,'four'),added=after.layout.cells.slice(2).map(row=>after.cells[row.id]);
 expect(before).toEqual(snapshot);expect(after.cells[before.layout.cells[0].id]).toEqual(before.cells[before.layout.cells[0].id]);expect(after.cells['active-second']).toEqual(before.cells['active-second']);
 expect(added.map(cell=>cell.indicators.map(row=>row.kind))).toEqual([['rsi'],['rsi']]);
 const studyIds=new Set(['first-rsi','first-script','active-ema']),paneIds=new Set(['shared-pane']);
 for(const cell of added){const study=cell.indicators[0],binding=cell.scriptBindings![0];expect({...study,id:rsi.id,paneId:rsi.paneId}).toEqual(rsi);expect(studyIds.has(study.id)).toBe(false);studyIds.add(study.id);expect(studyIds.has(binding.id)).toBe(false);studyIds.add(binding.id);expect(binding).toMatchObject({documentId:'saved-document',version:3,ownScale:true,visible:false});expect(binding.paneId).toBe(study.paneId);expect(paneIds.has(study.paneId!)).toBe(false);paneIds.add(study.paneId!);}
 added[0].indicators[0].inputs.length=99;added[0].indicators[0].plots.rsi.color='#000000';added[0].scriptBindings![0].plots.value.width=8;
 expect(added[1].indicators[0].inputs.length).toBe(7);expect(added[1].indicators[0].plots.rsi.color).toBe('#c470af');expect(added[1].scriptBindings![0].plots.value.width).toBe(3);expect(before).toEqual(snapshot);
});
// The chart type (and its type settings) now follow the active chart, as in the reference; every other setting keeps the LV factory policy.
it('new chart settings use explicit OpenCandle factory policy without copying customized active-chart settings',()=>{
 const before=input(),after=resizeMultiChartState(before,'three-columns'),added=after.cells[after.layout.cells[2].id],active=before.cells[before.layout.activeCellId];
 expect(added.style).toBe('line');expect(added.themeId).toBe(defaultTheme.id);expect(added.appearance).toEqual(defaultTheme.appearance);expect(added.chartOptions).toEqual({source:'close',scale:'linear',invert:false,auto:true,timezone:'UTC'});expect(added.viewport).toBeUndefined();expect(added.frame).toBeUndefined();expect(added.chartTypeSettings).toEqual(active.chartTypeSettings);expect(added.drawings).toEqual({version:1,drawings:[]});expect(added.drawingScopes?.inactive).toEqual([]);expect(added.comparisons).toEqual([]);expect(after.layout.activeCellId).toBe('active-second');
});
it('malformed first-chart indicator settings reject before changing any layout state',()=>{
 const before=input();before.cells[before.layout.cells[0].id].indicators[0].inputs.length=0;const snapshot=structuredClone(before);expect(()=>resizeMultiChartState(before,'four')).toThrow();expect(before).toEqual(snapshot);
});
