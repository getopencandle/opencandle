import {describe,expect,it} from 'vitest';
import {magnetSnap,snapTimeToSlot,slotProjector,indicatorValuesAt,installDrawingSnap,setIndicatorSnap,WEAK_MAGNET_PX} from '../../src/chart/drawing-snap';
import {restoreDrawingPreferences} from '../../src/ui/drawing-preferences';

const DAY=86400000,times=[0,DAY,2*DAY,5*DAY];// a weekend gap between bars 2 and 3
const coords={
 timeToLogical:(ms:number)=>{if(ms<=times[0])return ms/DAY;if(ms>=times[3])return 3+(ms-times[3])/DAY;let i=0;while(times[i+1]<ms)i++;return i+(ms-times[i])/(times[i+1]-times[i]);},
 logicalToTime:(l:number)=>l<=0?l*DAY:l>=3?times[3]+(l-3)*DAY:times[Math.floor(l)]+(times[Math.floor(l)+1]-times[Math.floor(l)])*(l-Math.floor(l)),
};
const bars=times.map((time,i)=>({time,open:10+i,high:12+i,low:9+i,close:11+i}));
const projector={pxToPoint:(x:number,y:number,_pane?:string)=>({time:x*DAY/10,price:100-y}),yOf:(price:number,_pane?:string)=>100-price};
const scene={indicators:new Map([['ma',{id:'ma',paneId:null,series:[{points:[{value:20},{value:21},{value:22},{value:23}]}]}],['rsi',{id:'rsi',paneId:'p1',series:[{points:[{value:50},{value:55},{value:60},{value:65}]}]}],['vol',{id:'vol',native:{type:'volume'},series:[{points:[{value:1e6}]}]}]]),offsetOf:()=>0};
const host={bars,coords,scene};

describe(' drawing snap (.UTILITY.SNAP_TO_INDICATORS)',()=>{
 it('pointer times land on bar slots, between bars and past either end',()=>{
  expect(snapTimeToSlot(coords,3.4*DAY)).toBe(2*DAY);expect(snapTimeToSlot(coords,4.2*DAY)).toBe(5*DAY);
  expect(snapTimeToSlot(coords,7.4*DAY)).toBe(7*DAY);expect(snapTimeToSlot(coords,-1.6*DAY)).toBe(-2*DAY);
  const p=slotProjector(projector,coords);expect(p.pxToPoint(34,50,'price')).toEqual({time:2*DAY,price:50});expect(p.yOf(5,'price')).toBe(95);
 });
 it('weak snaps by vertical distance only, strong always; off is unchanged',()=>{
  const near={time:DAY,price:13+WEAK_MAGNET_PX-1};
  expect(magnetSnap(host,projector,near,'price','weak',{x:999,y:100-near.price},false)).toEqual({time:DAY,price:13});
  const far={time:DAY,price:40};expect(magnetSnap(host,projector,far,'price','weak',{x:10,y:60},false)).toBe(far);
  expect(magnetSnap(host,projector,far,'price','strong',undefined,false)).toEqual({time:DAY,price:13});
  expect(magnetSnap(host,projector,far,'price','off',undefined,true)).toBe(far);
 });
 it('indicator values join the candidates of their own pane only, volume excluded',()=>{
  expect(indicatorValuesAt(host,'price',1)).toEqual([21]);expect(indicatorValuesAt(host,'p1',2)).toEqual([60]);
  expect(magnetSnap(host,projector,{time:DAY,price:20},'price','strong',undefined,true)).toEqual({time:DAY,price:21});
  expect(magnetSnap(host,projector,{time:DAY,price:20},'price','strong',undefined,false)).toEqual({time:DAY,price:13});
  expect(magnetSnap(host,projector,{time:2*DAY,price:58},'p1','strong',undefined,true)).toEqual({time:2*DAY,price:60});
  expect(magnetSnap(host,projector,{time:2*DAY,price:58},'p1','strong',undefined,false)).toEqual({time:2*DAY,price:58});
 });
 it('installs on a subclass prototype, leaves the instance unowned, reads the shared preference',()=>{
  class Base{drawingProjector(){return projector;}snapToCandle(){throw Error('replaced');}}class Sub extends Base{}
  installDrawingSnap(Sub.prototype);const renderer=Object.assign(new Sub(),host) as unknown as Record<string,unknown>;setIndicatorSnap(true);
  expect(Object.hasOwn(renderer,'drawingProjector')).toBe(false);
  expect((renderer.snapToCandle as (...a:unknown[])=>unknown)({time:DAY,price:20},'price','strong')).toEqual({time:DAY,price:21});setIndicatorSnap(false);
  expect((renderer.drawingProjector as ()=>typeof projector)().pxToPoint(34,0,'price').time).toBe(2*DAY);
 });
 it('the preference is additive: absent loads unchanged, bad values refuse',()=>{
  const base={schemaVersion:1,magnet:'off',lastEnabledMagnet:'weak',stay:false};
  expect(restoreDrawingPreferences(base)).toEqual(base);expect(restoreDrawingPreferences({...base,snapToIndicators:true}).snapToIndicators).toBe(true);
  expect(()=>restoreDrawingPreferences({...base,snapToIndicators:1})).toThrow();
 });
});
