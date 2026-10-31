import {describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {registerLvDrawingToolModules} from '../../src/chart/lv-drawing-types';
import {BARS_PATTERN_MODULE,LV_BARS_PATTERN} from '../../src/chart/lv-types/bars-pattern';
import {BARS_PATTERN_BAR_CAP,makeBarsPatternMember} from '../../src/chart/lv-types/bars-pattern-data';
import {BARS_PATTERN_MODES} from '../../src/chart/lv-types/bars-pattern-geometry';

// Density at the bar cap: a full-cap SYNTHETIC pattern
// projected 300 px wide paints at most width x 2 segments per mode, and the bucket pass stays within budget.
registerLvDrawingToolModules([BARS_PATTERN_MODULE]);
const n=BARS_PATTERN_BAR_CAP,T=1_700_000_000;
const bars=Array.from({length:n},(_,i)=>{const o=100+10*Math.sin(i/500),c=o+Math.sin(i/7);return{time:T+i*60,open:o,high:Math.max(o,c)+0.5,low:Math.min(o,c)-0.5,close:c};});
const member=makeBarsPatternMember({instrumentId:'SYNTHETIC:PERF',symbol:'PERF',fixture:true,datasetKey:'k',revision:'r',sourceKey:null,resolution:'1m',placedResolution:'1D',spanStart:T,spanEnd:T+n*60,refPrice:100,derived:false,trimmed:false},bars);
const proj={width:800,height:400,xOf:(t:number)=>100+(t-T*1000)/(n*60_000)*300,yOf:(p:number)=>400-2*p,pxToPoint:()=>({time:0,price:0}),paneIdAtY:()=>'price'} as never;
function counter(){const counts={moveTo:0,lineTo:0,stroke:0};const ctx:any=new Proxy({},{get:(_t,key:string)=>key in counts?()=>{(counts as any)[key]++;}:key==='getTransform'?()=>({a:1}):()=>undefined,set:()=>true});return{ctx,counts};}

describe('Bars pattern paint at the 50,000-bar cap',()=>{
 it('paints at most width x 2 segments per mode and within the time budget',()=>{
  for(const mode of Object.values(BARS_PATTERN_MODES)){
   const model:any=createDrawing(LV_BARS_PATTERN as never,{paneId:'price',anchors:[{time:T*1000,price:100},{time:(T+(n-1)*60)*1000,price:100}],props:{mode,mirrored:false,flipped:false,lvBarsPattern:member}} as never);
   const first=counter(),start=performance.now();model.lvPaint(first.ctx,proj,{fontFamily:'sans-serif',textColor:'#fff',background:'#000'});const elapsed=performance.now()-start;
   const segments=first.counts.moveTo+first.counts.lineTo;
   expect(segments,String(mode)).toBeLessThanOrEqual(300*2+2);
   expect(first.counts.stroke).toBe(1);
   expect(elapsed,String(mode)).toBeLessThan(500);
   // A repaint with unchanged inputs reuses the memoised columns.
   const again=counter(),t2=performance.now();model.lvPaint(again.ctx,proj,{fontFamily:'sans-serif',textColor:'#fff',background:'#000'});
   expect(again.counts).toEqual(first.counts);expect(performance.now()-t2).toBeLessThan(50);
  }
 });
});
