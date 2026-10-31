import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';
import {priceScaleHarness} from './price-scale-harness';

// the Price scale menu is mounted inside the chart cell, and its rows are not grid chrome, so the left press on "On the right"
// opens a native frame gesture (MultiChartGrid onPointerDownCapture -> frameGesture.begin) and its release starts the 200 ms
// window. The click then ran Merge inside that open gesture: mergeScales pins the indicators back (the native price frame
// changes), the indicator capture reaches captureCell -> frameGesture.invalidate(), which found a dirty opening and reported
// "Native frame publication is unavailable: a dirty gesture was interrupted" (the chart is quarantined; analysis edits are then
// refused). Fixed in the menu-to-port path: a menu command that is not itself a frame gesture first ends the pointer gesture its
// own click opened (host gesture flush), then mutates. The grid gesture below is the real createGridFrameGesture; the cell,
// frame and host are SYNTHETIC stand-ins wired the way MultiChartGrid wires them. No GUI claim.
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const element=()=>({className:'',style:{} as Record<string,string>,attributes:{} as Record<string,string>,children:[] as unknown[],dataset:{} as Record<string,string>,textContent:'' as string|null,
 setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},remove(){}});

function setup(){
 vi.useFakeTimers();vi.stubGlobal('document',{createElement:()=>element()});
 const dataset=fixtureDataset('GME',5);let state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const id=state.layout.activeCellId,source=sourceContextForDataset(dataset,dataset.bars);
 const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:['sma-own-scale'],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null} as unknown as HistoricalChartFrame;
 let current=frame;const viewport={from:1,to:5};
 const cell={chart:{captureHistoricalFrame:()=>structuredClone(current),getViewport:()=>({...viewport})} as unknown as ChartController,input:{source,bars:dataset.bars,style:'candles' as const},executionIdentity:'ordinary',fingerprints:{}};
 const failures:string[]=[],published:unknown[]=[];
 const gesture=createGridFrameGesture({read:()=>state,cell:target=>target===id?cell:null,publish:next=>{published.push(next);state=next;return true;},failed:(_ids,message)=>failures.push(message)});
 // MultiChartGrid captureCell: a cell change while a gesture is open invalidates it (quarantine when the frame moved).
 const captures:string[]=[];
 const captureCell=(what:string)=>{gesture.invalidate();if(failures.length)return false;captures.push(what);return true;};
 const stacked={right:['sma-own-scale'],left:[] as string[]};
 const h=priceScaleHarness({mergeScales:ids=>{
  // The indicator port pins each one back to the pane scale: the native frame changes, then the indicator capture runs.
  stacked.right=stacked.right.filter(row=>!ids.includes(row));current={...current,panes:[{...current.panes[0],owners:[]}]} as HistoricalChartFrame;
  if(!captureCell('indicators'))throw Error('The workspace refused the indicator scale change.');
 }});
 h.renderer.wrapper={clientWidth:0,clientHeight:0,appendChild(){}};h.renderer.plot=element();
 h.renderer.scene.ownScaleIndicatorsForPane=(paneId:string)=>paneId==='price'?stacked.right.map(row=>({id:row})):[];
 h.renderer.scene.lvLeftScaleIndicatorsForPane=()=>[];
 // GridCell's bindHost gesture: begin/finish/flush are the grid's frame gesture of this cell.
 h.port.bindHost({commitSettings:value=>captureCell('priceScale:'+JSON.stringify(value)),gesture:{begin:()=>gesture.begin(id),finish:()=>gesture.finish(),flush:()=>{gesture.flush();return false;}}});
 // The menu row press: a left pointerdown inside the cell opens the frame gesture, and its release starts the 200 ms window.
 const pressMenuRow=()=>{expect(gesture.begin(id)).toBe(true);gesture.finish();};
 return{h,gesture,failures,published,captures,stacked,pressMenuRow};
}

it('Merge > On the right from the menu runs after the menu click gesture: no quarantine, the indicator change is captured (fail-first)',()=>{
 const s=setup();
 s.pressMenuRow();
 expect(s.h.port.execute('mergeRight',{origin:'chart-pointer'})).toEqual({ok:true});
 expect(s.failures).toEqual([]);
 expect(s.captures).toEqual(['indicators']);expect(s.stacked.right).toEqual([]);
 // the press itself moved nothing, so ending its gesture published no frame edit
 expect(s.published).toEqual([]);expect(s.gesture.interceptsViewport()).toBe(false);
 vi.runAllTimers();expect(s.failures).toEqual([]);
});

it('Merge > On the left (side change too) from the menu is one clean pass: indicators, then the side, no quarantine (fail-first)',()=>{
 const s=setup();
 s.pressMenuRow();
 expect(s.h.port.execute('mergeLeft',{origin:'chart-pointer'})).toEqual({ok:true});
 expect(s.failures).toEqual([]);
 expect(s.captures[0]).toBe('indicators');expect(s.captures[1]).toMatch(/^priceScale:.*"mainSide":"left"/);
 expect(s.h.renderer.lvMainScaleSide()).toBe('left');
});

it('a scale command (Auto) still joins the open gesture as before (folded flush), so the fix only touches non-gesture commands',()=>{
 const s=setup();
 s.pressMenuRow();
 expect(s.h.port.execute('auto',{origin:'chart-pointer'})).toEqual({ok:true});
 expect(s.failures).toEqual([]);
});
