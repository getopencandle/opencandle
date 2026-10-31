import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {NativeRenderer} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {parseInterval} from '../../src/domain/intervals';
import {computeDerived} from '../../src/chart/derived';
import {buildDerivedAxis} from '../../src/chart/derived/derived-axis';
import {commandCanvas} from './chart-paint-harness';

// Renko (and the other derived types) on a daily chart drew clock times on the time axis, because the
// adapter fed the renderer a 60 s synthetic step for every source the interval parser gives no seconds for (day/week/month).
// The actual adapter step line runs here, then the pinned Vela time axis paints the derived feed. SYNTHETIC bars.
const source=readFileSync('src/chart/adapter.ts','utf8'),start=source.indexOf('    let seconds=60;try{'),end=source.indexOf('\n',start);
const stepLine=source.slice(start,end);
const adapterStep=(resolution:string|null):number=>Function('currentSource','parseInterval',stripTypeScriptTypes(stepLine,{mode:'transform'})+';return seconds;')({resolution},parseInterval);
const DAY=86400;
const daily:Bar[]=Array.from({length:240},(_,index)=>{const close=20+6*Math.sin(index/12)+index*0.02;return{time:Date.UTC(2025,0,2)/1000+index*DAY,open:close,high:close+0.4,low:close-0.4,close,volume:1};});
function axisLabels(step:number){
 const result=computeDerived('renko',daily,{boxMethod:'Traditional',boxSize:0.5,atrLength:14,percentage:1,source:'close',wicks:false});if(!result.ok)throw Error(result.diagnostic.code);
 const axis=buildDerivedAxis(result.value,step),from=axis.feed[0].time*1000,to=axis.feed.at(-1)!.time*1000;
 const native=new NativeRenderer() as any,recording=commandCanvas();native.scene.showAxisLabels=true;native.scene.timezone='UTC';
 const width=800,coords={visibleTimeRange:()=>({from,to}),timeToX:(time:number)=>(time-from)/(to-from)*width};
 native.chrome.drawTimeAxis(recording.ctx,native.scene,coords,{},width,400,428);
 return{bricks:axis.feed.length,labels:recording.commands.filter((row:any)=>row.op==='fillText').map((row:any)=>String(row.values[0]))};
}
describe('FLOWS-AUDIT-1028 #13 derived types keep a date axis on daily-or-higher sources',()=>{
 it('the adapter step follows the source interval',()=>{
  expect(adapterStep('1D')).toBe(DAY);expect(adapterStep('3D')).toBe(3*DAY);expect(adapterStep('1W')).toBe(7*DAY);expect(adapterStep('1M')).toBe(30*DAY);
  expect(adapterStep('1')).toBe(60);expect(adapterStep('15')).toBe(900);expect(adapterStep('60')).toBe(3600);expect(adapterStep('5S')).toBe(5);
  expect(adapterStep(null)).toBe(60);expect(adapterStep('100R')).toBe(60);expect(adapterStep('not an interval')).toBe(60);
 });
 it('a daily Renko axis shows dates, no clock times',()=>{
  const {bricks,labels}=axisLabels(adapterStep('1D'));expect(bricks).toBeGreaterThan(20);expect(labels.length).toBeGreaterThan(2);
  expect(labels.filter(label=>/^\d{1,2}:\d{2}$/.test(label))).toEqual([]);
  // The old 60 s step on the same bricks is the reported symptom.
  expect(axisLabels(60).labels.some(label=>/^\d{1,2}:\d{2}$/.test(label))).toBe(true);
 });
});
