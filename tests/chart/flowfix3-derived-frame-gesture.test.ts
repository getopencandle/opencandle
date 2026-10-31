import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import {supportsHistoricalFrame,validateHistoricalFrame} from '../../src/chart/historical-frame';
import {DERIVED_STYLES} from '../../src/chart/derived/common';
import type {ChartController} from '../../src/chart/adapter';
// A press on a Range (or any derived / profile) chart used to open a frame gesture whose capture threw
// "Unsupported historical chart topology", which reported "The frame gesture cannot be saved", refused the press and
// quarantined the cell (studies "Waiting", Data window frozen). Such charts have no historical frame: the gesture now
// passes through without interception so the viewport saves through the ordinary capture path. SYNTHETIC fixtures.
function harness(styles:Record<number,string>){
 const dataset=fixtureDataset('GME',5);const state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');state.layout.sync.time=true;
 const source=sourceContextForDataset(dataset,dataset.bars),owners=new Map<string,any>(),published:unknown[]=[],failures:string[]=[];let captures=0;
 state.layout.cells.forEach((row,index)=>{const style=styles[index]??'candles';owners.set(row.id,{chart:{captureHistoricalFrame:()=>{captures++;const frame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};return validateHistoricalFrame(frame);},getViewport:()=>({from:1,to:5})} as unknown as ChartController,input:{source,bars:dataset.bars,style},executionIdentity:'ordinary',fingerprints:{}});});
 const gesture=createGridFrameGesture({read:()=>state,cell:id=>owners.get(id)??null,publish:next=>{published.push(next);return true;},failed:(_ids,message)=>failures.push(message)});
 return{gesture,ids:state.layout.cells.map(row=>row.id),published,failures,captures:()=>captures};
}
const NO_FRAME=[...DERIVED_STYLES,'footprint','tpo','sessionvp'];
it('derived and profile styles have no historical frame topology; the standard time styles keep theirs',()=>{
 for(const style of NO_FRAME)expect(supportsHistoricalFrame(style)).toBe(false);
 for(const style of ['candles','bars','line','heikinashi','hlcbars'])expect(supportsHistoricalFrame(style)).toBe(true);
});
for(const style of NO_FRAME)it(`a press on a ${style} chart proceeds without a frame error, interception or quarantine`,()=>{
 const h=harness({0:style,1:style});expect(h.gesture.begin(h.ids[0])).toBe(true);expect(h.gesture.interceptsViewport()).toBe(false);
 h.gesture.finish();h.gesture.flush();expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.captures()).toBe(0);
 // The next press is not blocked by a leftover refusal.
 expect(h.gesture.begin(h.ids[0])).toBe(true);expect(h.failures).toEqual([]);
});
it('a time-linked group with one Range chart passes through as a whole (no partial frame publication)',()=>{
 const h=harness({1:'range'});expect(h.gesture.begin(h.ids[0])).toBe(true);expect(h.gesture.interceptsViewport()).toBe(false);h.gesture.flush();expect(h.failures).toEqual([]);expect(h.published).toEqual([]);
});
it('standard time charts still open an intercepting frame gesture',()=>{
 const h=harness({});expect(h.gesture.begin(h.ids[0])).toBe(true);expect(h.gesture.interceptsViewport()).toBe(true);expect(h.captures()).toBe(2);expect(h.failures).toEqual([]);
});
