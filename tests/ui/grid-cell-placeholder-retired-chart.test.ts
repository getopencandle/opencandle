import {afterEach,expect,it} from 'vitest';
import {actualCell,liveData} from '../fixtures/live-staging-cell';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {all} from '../helpers/alert-dialog-harness';
import {defaultTheme} from '../../src/ui/themes';
import {demoPlaceholderDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import type {ChartController} from '../../src/chart/adapter';
import type {ChartInputSnapshot} from '../../src/chart/input-visibility';

// A live chart cell switched to a symbol with no live data (an empty example placeholder) unmounts its ChartPanel, which
// disposes the chart. The cell's own effects re-run in that same commit, before the panel's null report lands; they must
// never reach the retired chart (its indicator port throws "Indicator port is disposed.").
const closes:Array<()=>void>=[];
afterEach(()=>{for(const close of closes.splice(0).reverse())close();clearLiveDatasets();});

function retiredChart(saved:()=>{chartOptions:unknown;drawings:unknown}){
 const state={disposed:false,calls:[] as string[]};
 const port=(name:string)=>()=>{state.calls.push(name);if(state.disposed)throw Error(`${name} port is disposed.`);return()=>{};};
 const chart={
  getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>saved().chartOptions,applyChartOptions:()=>{},saveDrawings:()=>saved().drawings,loadDrawings:()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:port('Indicator')},comparisons:{restore:()=>{},list:()=>[],subscribe:port('Comparison')},
  onDrawingsChanged:port('Drawing'),getViewport:()=>({from:1,to:3}),setViewport:()=>{},onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},
  applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},drawings:{getMode:()=>null},
  isDrawingChromeTarget:()=>false,getChartSettingsBook:()=>({}),isInputCurrent:()=>true,isInputExact:()=>true,isInputOwned:()=>true,waitForAnalysisPlacement:async()=>{},
 } as unknown as ChartController;
 return {chart,state};
}

it('a live chart cell that switches to an empty example placeholder never subscribes to the retired chart',()=>{
 const data=liveData();registerLiveDataset(data);
 const grid=createMultiChartState(data,{appearance:defaultTheme.appearance}),id=grid.layout.activeCellId;
 const cell=actualCell(data,false,grid,id);closes.push(()=>cell.dispose());cell.set({port:{mount:()=>()=>{}}});
 const saved=()=>cell.getProps().saved as {chartOptions:unknown;drawings:unknown};
 const {chart,state}=retiredChart(saved),input:ChartInputSnapshot={bars:data.bars,source:sourceContextForDataset(data),style:'candles'};
 (cell.panel().onReady as (chart:ChartController,input:ChartInputSnapshot,execution:string)=>void)(chart,input,'ordinary');cell.ui.settle();
 expect(state.calls).toContain('Indicator');
 // The watchlist click: the panel unmounts (its chart is disposed) and the cell re-renders on the placeholder input.
 state.disposed=true;state.calls.length=0;
 const placeholder=demoPlaceholderDataset('SPY');
 expect(()=>cell.set({dataset:placeholder,bars:[],datasets:[placeholder]})).not.toThrow();
 expect(state.calls).toEqual([]);
 expect(all(cell.ui.render(),value=>value.type===ChartPanel)).toHaveLength(0);
});
