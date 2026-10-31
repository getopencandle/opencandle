import {afterEach,describe,expect,it} from 'vitest';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {validateIndicatorPresentationContext,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {profileBoxes,profilesBoxes,VP_MAX_BOXES} from '../../src/chart/vp-visible-range-presentation';
import {source as ownedProfileFixture} from '../fixtures/r43-profile-source';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {profileSourceContext,profileLowerTimeframe,setProfileDatasets,sourceInstrumentId} from '../../src/chart/vp-visible-range-ltf';
import {buildVolumeProfile} from '../../src/domain/volume-profile';
import {indicatorInstanceLabels,indicatorNames} from '../../src/ui/indicator-dialog-model';
import type {BarDataset} from '../../src/domain/types';

// through the REAL indicator port and presentation (minimal in-memory native host). SYNTHETIC bars only.
const DAY=86400,T0=1767225600;
const bar=(i:number,volume=100)=>({time:T0+i*DAY,open:10+i,high:11+i,low:9+i,close:10.5+i,volume});
const BARS=Array.from({length:12},(_,i)=>bar(i));
function rig(context:IndicatorPresentationContext={resolution:'1D',calendar:'utc'},bars=BARS){
 const host=nativeHost(bars.map(row=>({...row,time:row.time*1000})));let range:{from:number;to:number}|null=null;
 (host.chart as any).getVisibleRange=()=>range;
 const port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,()=>bars,undefined,()=>context);
 const live=(id:string)=>host.live.get(port.list().find(row=>row.id===id)!.rendererId);
 const pan=(id:string,from:number,to:number)=>{range={from:(T0+from*DAY)*1000,to:(T0+to*DAY)*1000};live(id)?.model.onViewport(range);};
 return {host,port,live,pan,setRange:(from:number,to:number)=>{range={from:(T0+from*DAY)*1000,to:(T0+to*DAY)*1000};},emitted:(id:string)=>live(id).emitted};
}
afterEach(()=>setProfileDatasets([]));

describe(' visible range volume profile on the real port',()=>{
 it('the descriptor reacts to the viewport; the histogram is emitted as boxes inside the pane, anchored on the right',()=>{
  const r=rig();r.setRange(2.6,8.4);const id=r.port.add('vrvp');
  expect(getNativeIndicator(r.live(id).type)!.reactsToViewport).toBe(true);
  const out=r.emitted(id);expect(out.boxes.length).toBeGreaterThan(0);
  const right=Math.max(...out.boxes.map((b:any)=>b.right)),left=Math.min(...out.boxes.map((b:any)=>b.left));
  expect(right).toBeCloseTo(8.4,9);expect(left).toBeCloseTo(8.4-(8.4-2.6)*0.3,9);// Width 30% of the pane, from the right edge
  expect(out.boxes.every((b:any)=>b.xloc==='bar_index'&&b.extend==='none'&&typeof b.bgColor==='string')).toBe(true);
  const poc=r.port.values(id).series.find(row=>row.id==='poc')!.values;
  expect(poc.map(value=>value!==null)).toEqual(BARS.map((_,i)=>i>=3&&i<=8));
 });
 it('panning recalculates over the newly visible bars',()=>{
  const r=rig();r.setRange(0,4);const id=r.port.add('vrvp');
  const before=r.port.values(id).series.find(row=>row.id==='poc')!.values;
  r.pan(id,6.6,11.4);
  const after=r.port.values(id).series.find(row=>row.id==='poc')!.values;
  expect(before.slice(0,5).every(value=>value!==null)).toBe(true);expect(after.slice(0,7).every(value=>value===null)).toBe(true);expect(after[9]).not.toBeNull();
  expect(Math.max(...r.emitted(id).boxes.map((b:any)=>b.right))).toBeCloseTo(11.4,9);
  const direct=buildVolumeProfile(BARS,7,11,{rowsLayout:'Number Of Rows',rowSize:24,valueAreaPct:70})!;expect(after[8]).toBe(direct.pocPrice);
 });
 it('Placement Left, Total and Delta volume, and the width input',()=>{
  const r=rig();r.setRange(2.6,8.4);const id=r.port.add('vrvp',{placement:'Left',volume:'Total',widthPct:50});
  const out=r.emitted(id).boxes;expect(Math.min(...out.map((b:any)=>b.left))).toBeCloseTo(2.6,9);expect(Math.max(...out.map((b:any)=>b.right))).toBeCloseTo(2.6+5.8*0.5,9);
  expect(new Set(out.map((b:any)=>b.id.includes(':total'))).size).toBe(1);
  r.port.update(id,{inputs:{volume:'Delta'}});expect(r.emitted(id).boxes.every((b:any)=>b.id.includes(':delta'))).toBe(true);
 });
 it('hide stops the output, show restores it, remove retires the native instance',()=>{
  const r=rig();r.setRange(1,6);const id=r.port.add('vrvp'),renderer=r.port.list()[0].rendererId;
  r.port.update(id,{visible:false});expect(r.host.live.get(renderer).visible).toBe(false);
  r.port.update(id,{visible:true});expect(r.emitted(id).boxes.length).toBeGreaterThan(0);
  const saved=r.port.serialize();expect(saved[0]).toMatchObject({kind:'vrvp',visible:true});
  r.port.remove(id);expect(r.host.live.has(renderer)).toBe(false);expect(r.port.list()).toEqual([]);
  r.port.restore(saved);expect(r.port.list()[0]).toMatchObject({id,kind:'vrvp'});
 });
 it('the toolbar Hide indicators overlay and a display offset draw no histogram',()=>{
  const hidden=rig({resolution:'1D',hideOverlay:true});const a=hidden.port.add('vrvp');expect(hidden.emitted(a).boxes).toBeUndefined();
  const r=rig();const b=r.port.add('vrvp');r.port.update(b,{offset:2});expect(r.emitted(b).boxes).toBeUndefined();
  expect(r.port.list()[0].presentationDiagnostics.join(' ')).toMatch(/offset/);
 });
 it('legend label and dialog name come from the catalog',()=>{
  const r=rig();const id=r.port.add('vrvp');
  expect(indicatorNames.vrvp).toBe('Visible range volume profile');expect(indicatorInstanceLabels(r.port.list()).get(id)).toBe('VRVP Number Of Rows 24 Up/Down');
 });
});

describe(' periodic volume profile on the real port',()=>{
 it('one histogram per period, anchored at each period\'s first bar edge; no viewport reaction',()=>{
  const r=rig();const id=r.port.add('pvp',{period:'Week'});
  expect(getNativeIndicator(r.live(id).type)!.reactsToViewport).toBeUndefined();
  const boxes=r.emitted(id).boxes,starts=[...new Set(boxes.map((b:any)=>JSON.parse(b.id.slice('lv-decoration:'.length))[1].split(':')[1]))];
  // 2026-01-01 is a Thursday: weeks Jan 1-4, 5-11, 12.
  expect(starts).toEqual(['0','4','11']);
  const first=boxes.filter((b:any)=>b.id.includes('"vp:0:'));expect(Math.min(...first.map((b:any)=>b.left))).toBeCloseTo(-0.5,9);
  expect(Math.max(...first.map((b:any)=>b.right))).toBeCloseTo(-0.5+4*0.3,9);
 });
});

describe(' tick size and lower-timeframe bars reach the calculation',()=>{
 it('Ticks Per Row uses the context tick size, and refuses without one',()=>{
  const r=rig({resolution:'1D',tickSize:0.5});const id=r.port.add('pvp',{rowsLayout:'Ticks Per Row',rowSize:2,period:'Month'});
  expect(r.port.list()[0].diagnostics).toEqual([]);expect(r.port.values(id).series.length).toBe(6);// POC, VAH, VAL and the three developing levels
  const none=rig();none.port.add('pvp',{rowsLayout:'Ticks Per Row',rowSize:2});expect(none.port.list()[0].diagnostics.join(' ')).toMatch(/tick size/);
 });
 it('a loaded finer dataset of the same instrument is used; another instrument is not',()=>{
  const fine=Array.from({length:4},(_,k)=>({time:T0+5*DAY+k*6*3600,open:14,high:14.2,low:14,close:14.2,volume:1000}));
  // The former metadata-free instrument-only fixture granted foreign data authority. Keep all numerical oracles, with actual same-source ownership.
  const dataset=(id:string,resolution:string,bars:any[])=>{const value=ownedProfileFixture(resolution,bars,'local:SYNTHETIC:'+id+':'+resolution);return{...value,instrument:{...value.instrument,id,symbol:id,name:'SYNTHETIC '+id}};};
  const primary=dataset('syn-1','1D',BARS);setProfileDatasets([dataset('other','6h',fine),primary,dataset('syn-1','6h',fine)]);
  const context=profileSourceContext(sourceContextForDataset(primary),primary.bars);
  expect(profileLowerTimeframe('syn-1','1D',undefined,context.profileSource)?.interval).toBe('360m');// canonical interval id of 6hexpect(profileLowerTimeframe('syn-1','6h')).toBeNull();expect(profileLowerTimeframe('missing','1D')).toBeNull();
  const r=rig({resolution:'1D',instrument:'syn-1',...context});const id=r.port.add('pvp',{period:'Month',valueAreaVolume:0});
  const plain=rig();const base=plain.port.add('pvp',{period:'Month',valueAreaVolume:0});
  const poc=r.port.values(id).series[0].values[0],plainPoc=plain.port.values(base).series[0].values[0];
  expect(poc).not.toBe(plainPoc);const row=13/24;expect(Math.abs(poc!-14.1)).toBeLessThan(row);// the POC row holds the 4000 finer-bar volume at 14-14.2
  expect(r.port.values(id).profiles![0].lowerTimeframeBars).toBe(1);
  expect(sourceInstrumentId(JSON.stringify([1,'syn-1']))).toBe('syn-1');expect(sourceInstrumentId('not json')).toBeUndefined();
 });
 it('the presentation context accepts a positive tick size and an instrument id only',()=>{
  expect(()=>validateIndicatorPresentationContext({resolution:'1D',tickSize:0.01,instrument:'syn-1'})).not.toThrow();
  expect(()=>validateIndicatorPresentationContext({resolution:'1D',tickSize:0} as any)).toThrow();
  expect(()=>validateIndicatorPresentationContext({resolution:'1D',instrument:''} as any)).toThrow();
 });
});

describe(' box layout (SYNTHETIC)',()=>{
 const ABC=[{time:T0,open:10,high:14,low:10,close:14,volume:400},{time:T0+DAY,open:12,high:12,low:11,close:11,volume:300},{time:T0+2*DAY,open:12,high:12,low:12,close:12,volume:50}];
 const p=buildVolumeProfile(ABC,0,2,{rowsLayout:'Number Of Rows',rowSize:4,valueAreaPct:70},{left:0,right:10})!;
 it('Up/Down: the up part starts at the anchor, the down part follows; lengths scale to the largest row',()=>{
  const boxes=profileBoxes(p,{volume:'Up/Down',placement:'Left',widthPct:40},role=>role);
  const row1=boxes.filter(b=>b.id.startsWith('row:1:'));// POC row: 100 up, 300 down, max width 4
  expect(row1.map(b=>[b.id,b.left,b.right])).toEqual([['row:1:up',0,1],['row:1:down',1,4]]);
  const row0=boxes.find(b=>b.id==='row:0:up')!;expect([row0.left,row0.right]).toEqual([0,1]);
  expect(row0.bgColor).not.toBe(boxes.find(b=>b.id==='row:2:up')!.bgColor);// row 0 is outside the value area, row 2 inside
  const right=profileBoxes(p,{volume:'Up/Down',placement:'Right',widthPct:40},role=>role).filter(b=>b.id.startsWith('row:1:'));
  expect(right.map(b=>[b.left,b.right])).toEqual([[9,10],[6,9]]);
 });
 it('Delta draws |up - down| in the dominant color; the box cap keeps the newest profiles',()=>{
  const delta=profileBoxes(p,{volume:'Delta',placement:'Left',widthPct:40},role=>role);
  expect(delta.find(b=>b.id==='row:1:delta')).toMatchObject({left:0,right:4});
  const many=Array.from({length:Math.ceil(VP_MAX_BOXES/5)+3},(_,k)=>({...p,from:k,to:k}));
  const drawn=profilesBoxes(many,{volume:'Up/Down',placement:'Left',widthPct:40},role=>role);
  expect(drawn.boxes.length).toBeLessThanOrEqual(VP_MAX_BOXES);expect(drawn.diagnostics.join(' ')).toMatch(/older profiles are not drawn/);
  expect(drawn.boxes.at(-1)!.id.startsWith('vp:'+(many.length-1)+':')).toBe(true);
 });
});
