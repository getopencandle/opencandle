import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
import type {IndicatorId} from '../../src/domain/indicators';

// An indicator added on another indicator's output, on that indicator's pane ("Add indicator on RSI"),
// shares the parent's scale instead of getting a second scale column. Real indicator port on the pinned native core harness,
// SYNTHETIC bars. Not GUI evidence (the packaged-build screenshot is in
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1,low:close-1,close,volume:100+i};});
async function core(){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;return {t,port,close(){port.dispose();t.dispose();}};}
const add=(port:any,kind:IndicatorId)=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,factory.inputs,factory) as string;};
/** The add-on route (IndicatorDialog placed()): Source = the parent's plot, paneId = the parent's logical pane. */
const addOn=(port:any,kind:IndicatorId,parent:string,plot:string)=>{const factory=factoryIndicatorDefault(kind),paneId=port.serialize().find((row:any)=>row.id===parent).paneId;return port.add(kind,{...factory.inputs,source:encodeIndicatorSource(parent,plot)},{...factory,paneId}) as string;};
const nativeOwn=(t:any,port:any,id:string)=>t.native.scene.indicators.get(port.list().find((row:any)=>row.id===id).rendererId)?.ownScale===true;

it('SMA on RSI joins the RSI pane on the pane scale (one scale column), and the pin is saved',async()=>{
 const a=await core();try{
  const rsi=add(a.port,'rsi'),sma=addOn(a.port,'sma',rsi,'rsi');
  expect(a.port.list().find((row:any)=>row.id===sma)!.paneId).toBe(a.port.list().find((row:any)=>row.id===rsi)!.paneId);
  expect(a.port.scale(rsi).placement).toBe('shared');
  expect(a.port.scale(sma)).toMatchObject({ownScale:false,placement:'shared'});expect(nativeOwn(a.t,a.port,sma)).toBe(false);
  expect(a.port.serialize().find((row:any)=>row.id===sma)!.ownScale).toBe(false);
 }finally{a.close();}
});
it('when RSI is on its own extra scale, the SMA on it shares that scale through one scale group',async()=>{
 const a=await core();try{
  const rsi=add(a.port,'rsi');a.port.setScale(rsi,'own');expect(a.port.scale(rsi).placement).toBe('own');
  const sma=addOn(a.port,'sma',rsi,'rsi'),parent=a.port.scale(rsi),child=a.port.scale(sma);
  expect(child.placement).toBe('own');expect(child.group).toBeDefined();expect(child.group).toBe(parent.group);
 }finally{a.close();}
});
it('a saved placement wins (restore keeps what was saved) and a plain SMA on the price pane is unchanged',async()=>{
 const a=await core();try{
  const rsi=add(a.port,'rsi'),factory=factoryIndicatorDefault('sma'),paneId=a.port.serialize().find((row:any)=>row.id===rsi)!.paneId;
  const own=a.port.add('sma',{...factory.inputs,source:encodeIndicatorSource(rsi,'rsi')},{...factory,paneId,ownScale:true}) as string;
  expect(a.port.scale(own).placement).toBe('own');
  const plain=add(a.port,'sma');expect(a.port.list().find((row:any)=>row.id===plain)!.paneId).toBe('price');expect(a.port.scale(plain).pinned).toBe(false);
 }finally{a.close();}
});
