import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture,type FrameGestureCell} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';

function fixture(){
 const dataset=fixtureDataset('GME',5),source=sourceContextForDataset(dataset,dataset.bars);
 let state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');state.layout.sync.time=true;
 const frames=new Map<string,HistoricalChartFrame>(),viewports=new Map<string,{from:number;to:number}>(),owners=new Map<string,FrameGestureCell>();
 const publications:Array<{next:typeof state;baseline:GridFrameEditBaseline}>=[],failures:string[]=[];let accepted=true;
 for(const row of state.layout.cells){
  frames.set(row.id,{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});
  viewports.set(row.id,{from:1,to:5});
  const chart={captureHistoricalFrame:()=>structuredClone(frames.get(row.id)!),getViewport:()=>viewports.get(row.id)} as unknown as ChartController;
  owners.set(row.id,{chart,input:{source,bars:dataset.bars,style:'candles'},executionIdentity:'ordinary',fingerprints:{}});
 }
 const gesture=createGridFrameGesture({read:()=>state,cell:id=>owners.get(id)??null,publish:(next,baseline)=>{publications.push({next,baseline});if(accepted)state=next;return accepted;},failed:(_ids,message)=>failures.push(message)});
 return{gesture,frames,viewports,owners,publications,failures,state:()=>state,reject:()=>{accepted=false;}};
}

it('viewport-only publication preserves the exact options object and retains the full closing frame and opening baseline',()=>{
 const h=fixture(),before=h.state(),id=before.layout.activeCellId,options=before.cells[id].chartOptions;
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.gesture.flush();
 expect(h.publications).toHaveLength(1);const {next,baseline}=h.publications[0];
 expect(next.cells[id].chartOptions).toBe(options);expect(next.cells[id].viewport).toEqual({from:2,to:6});expect(next.cells[id].frame).toEqual(h.frames.get(id));
 expect(baseline.expectedGrid).toBe(before);expect(baseline.viewports[id]).toEqual({from:1,to:5});expect(h.failures).toEqual([]);
});

it('each actual derived scale, invert or autoscale change creates updated options without mutating the opening options',()=>{
 for(const change of ['manual','invert','log','percent'] as const){
  const h=fixture(),before=h.state(),id=before.layout.activeCellId,options=before.cells[id].chartOptions,snapshot=structuredClone(options);
  expect(h.gesture.begin(id)).toBe(true);const price=h.frames.get(id)!.panes[0];
  if(change==='manual')price.manualRange={min:10,max:20};else if(change==='invert')price.invert=true;else if(change==='log')price.log=true;else price.mode='percent';
  h.gesture.flush();const next=h.publications[0].next.cells[id];
  expect(next.chartOptions).not.toBe(options);expect(options).toEqual(snapshot);expect(next.chartOptions).toEqual({...snapshot,auto:price.manualRange===null,invert:price.invert,scale:price.log?'logarithmic':price.mode==='price'?'linear':price.mode});expect(next.frame).toEqual(h.frames.get(id));expect(h.failures).toEqual([]);
 }
});

it('linked viewport publications preserve each unchanged options identity and update only the target with a genuine scale change',()=>{
 const h=fixture(),before=h.state(),ids=before.layout.cells.map(row=>row.id);
 expect(h.gesture.begin(ids[0])).toBe(true);for(const id of ids)h.viewports.set(id,{from:3,to:7});h.frames.get(ids[1])!.panes[0].invert=true;h.gesture.flush();
 const {next,baseline}=h.publications[0];expect(Object.keys(baseline.frames)).toEqual(ids);expect(next.cells[ids[0]].chartOptions).toBe(before.cells[ids[0]].chartOptions);expect(next.cells[ids[1]].chartOptions).not.toBe(before.cells[ids[1]].chartOptions);expect(next.cells[ids[1]].chartOptions.invert).toBe(true);expect(h.failures).toEqual([]);
});

it('rejected viewport publication retains saved state and the original options identities',()=>{
 const h=fixture(),before=h.state(),id=before.layout.activeCellId,options=before.cells[id].chartOptions;h.reject();
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.gesture.flush();
 expect(h.state()).toBe(before);expect(h.state().cells[id].chartOptions).toBe(options);expect(h.publications[0].next.cells[id].chartOptions).toBe(options);expect(h.failures).toHaveLength(1);expect(h.failures[0]).toContain('rejected');
});

it('a replaced native owner still refuses publication and cannot convert the reference optimization into an acknowledgment',()=>{
 const h=fixture(),before=h.state(),id=before.layout.activeCellId,owner=h.owners.get(id)!;
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.owners.set(id,{...owner,chart:{...owner.chart} as ChartController});h.gesture.flush();
 expect(h.state()).toBe(before);expect(h.publications).toEqual([]);expect(h.failures).toHaveLength(1);expect(h.failures[0]).toContain('owner changed');
});
