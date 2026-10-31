import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {INDICATOR_SCALE_GAPS} from '../../src/chart/indicator-scale';
import type {IndicatorId} from '../../src/domain/indicators';

// every IND.<K>.SCALE_PLACEMENT leaf (30 kinds) through the port on the pinned core with the patched renderer
// (LV-VELA-SCALE-PLACEMENT-1, SYNTHETIC bars. Not a packaged-GUI claim.
// Facts: the recorded facts "Pin to scale" submenu; static-legend-indicators#more.pinToScale.
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
async function core(stripSide=false){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;if(stripSide)t.native.lvIndicatorScalePlacement=undefined;return {t,port,close(){port.dispose();t.dispose();}};}
type Host=Awaited<ReturnType<typeof core>>;
// Three shared hosts (the pinned core is large; one per case would exhaust memory): A = patched renderer, B = restore target, C = renderer without the side.
let A:Host,B:Host,C:Host;const calls:any[]=[];
beforeAll(async()=>{A=await core();B=await core();C=await core(true);const original=A.t.native.setIndicatorPane.bind(A.t.native);A.t.native.setIndicatorPane=(handle:any,pane:string,options:any)=>{calls.push(options);return original(handle,pane,options);};});
afterAll(()=>{for(const host of [A,B,C])host.close();});
afterEach(()=>{for(const host of [A,B,C])for(const row of host.port.list())host.port.remove(row.id);calls.length=0;});
const add=(port:any,kind:IndicatorId)=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,factory.inputs,factory) as string;};
const nativeOf=(port:any,id:string)=>port.list().find((row:any)=>row.id===id).rendererId as string;
const valuesJson=(port:any,id:string)=>JSON.stringify(port.values(id).series.map((s:any)=>s.values));

it.each([...INDICATOR_KINDS])('SCALE_PLACEMENT %s: own, left and none reach the renderer; values bit-identical; serialize and restore keep it; a pane move clears it; a renderer without the side falls back with a notice',async kind=>{
 const a=A;
 try{
  const id=add(a.port,kind),partner=add(a.port,kind==='rsi'?'macd':'rsi'),nativeId=nativeOf(a.port,id),shared=valuesJson(a.port,id);
  calls.length=0;
  // own
  a.port.setScale(id,'own');expect(a.port.scale(id)).toMatchObject({placement:'own',ownScale:true,pinned:true});expect(valuesJson(a.port,id)).toBe(shared);
  // left
  calls.length=0;a.port.setScale(id,'left');
  expect(calls.some(options=>options?.lvScalePlacement==='left'&&options.ownScale===true),'renderer call carries left').toBe(true);
  expect(a.t.native.lvIndicatorScalePlacement(nativeId)).toBe('left');expect(a.port.scale(id)).toMatchObject({placement:'left',pinned:true});expect(valuesJson(a.port,id)).toBe(shared);
  const savedLeft=JSON.parse(JSON.stringify(a.port.serialize()));expect(savedLeft.find((row:any)=>row.id===id)).toMatchObject({ownScale:true,scalePlacement:'left'});
  // none
  calls.length=0;a.port.setScale(id,'none');
  expect(calls.some(options=>options?.lvScalePlacement==='none'&&options.ownScale===true),'renderer call carries none').toBe(true);
  expect(a.t.native.lvIndicatorScalePlacement(nativeId)).toBe('none');expect(a.port.scale(id)).toMatchObject({placement:'none',pinned:true});expect(valuesJson(a.port,id)).toBe(shared);
  const savedNone=JSON.parse(JSON.stringify(a.port.serialize()));expect(savedNone.find((row:any)=>row.id===id)).toMatchObject({ownScale:true,scalePlacement:'none'});
  // restore (a restart) keeps each side and the values
  for(const saved of [savedLeft,savedNone]){
   const b=B;
   try{const side=saved.find((row:any)=>row.id===id).scalePlacement;b.port.restore(saved);expect(b.port.scale(id)).toMatchObject({placement:side,pinned:true});expect(b.port.serialize()).toEqual(saved);expect(valuesJson(b.port,id)).toBe(shared);}
   finally{for(const row of b.port.list())b.port.remove(row.id);}
  }
  // a renderer without the side keeps the saved side, runs on its own scale, and says so
  const c=C;
  try{const outcome:any=c.port.restore(savedLeft);
   expect(c.port.scale(id)).toMatchObject({placement:'own',fallback:'left'});expect(c.port.serialize()).toEqual(savedLeft);
   expect(outcome.notices?.[0]).toContain(INDICATOR_SCALE_GAPS.left);expect(outcome.notices[0]).toMatch(/own pane scale instead of the saved left scale/);
   expect(valuesJson(c.port,id)).toBe(shared);}
  finally{for(const row of c.port.list())c.port.remove(row.id);}
  // back to shared leaves no side
  a.port.setScale(id,'shared');expect(a.port.scale(id)).toMatchObject({placement:'shared',ownScale:false});expect(a.t.native.lvIndicatorScalePlacement(nativeId)).toBeNull();
  expect(Object.hasOwn(a.port.serialize().find((row:any)=>row.id===id)!,'scalePlacement')).toBe(false);
  // a pane move clears the pin
  a.port.setScale(id,'left');
  a.port.move(id,{pane:(a.port.list().find((row:any)=>row.id===partner) as any).paneId as string});
  expect(a.t.native.lvIndicatorScalePlacement(nativeId)).toBeNull();expect(a.port.scale(id).pinned).toBe(false);
  expect(Object.hasOwn(a.port.serialize().find((row:any)=>row.id===id)!,'scalePlacement')).toBe(false);expect(a.t.native.lvLeftScaleWidth()).toBe(0);
  expect(valuesJson(a.port,id)).toBe(shared);
 }finally{/* shared host */}
});

it.each([...INDICATOR_KINDS])('SCALE_PLACEMENT %s: a same-pane move on an already own-scaled indicator leaves renderer and saved state agreeing (VC5-1)',async kind=>{
 const a=A;
 try{
  const id=add(a.port,kind),nativeId=nativeOf(a.port,id);
  a.port.setScale(id,'left');
  const pane=(a.port.list().find((row:any)=>row.id===id) as any).paneId as string;
  a.port.move(id,{pane});
  const placement=a.t.native.lvIndicatorScalePlacement(nativeId) as 'left'|'none'|null,saved=a.port.serialize().find((row:any)=>row.id===id) as any;
  // Whatever the port decides, the readback and the saved snapshot must not disagree (no stale left/none on either side).
  expect(saved.scalePlacement??null).toBe(placement);
  expect(a.port.scale(id).placement).toBe(placement??(a.port.scale(id).ownScale?'own':'shared'));
  expect(a.port.scale(id).pinned).toBe(placement!==null||saved.ownScale!==undefined);
 }finally{/* shared host */}
});

it('Volume placement evidence (IND.VOLUME.PANE_PLACEMENT, not claimed: waits on Q1): OpenCandle adds Volume in its own pane below and Move to can put it on the price pane and back',async()=>{
 const a=A;
 try{
  const id=add(a.port,'volume'),before=(a.port.list().find((row:any)=>row.id===id) as any).paneId as string;
  expect(before).not.toBe('price');// SBI#volume.legacy defaultPane "new pane below"
  a.port.move(id,{pane:'price'});expect((a.port.list().find((row:any)=>row.id===id) as any).paneId).toBe('price');
 }finally{/* shared host */}
});
