import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {priceScaleHarness} from './price-scale-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {validateIndicatorSettings} from '../../src/chart/indicator-settings';
import {INDICATOR_SCALE_GROUP_GAP,readIndicatorScaleGroup,readIndicatorScaleHolder} from '../../src/chart/indicator-scale';
import {pinToScaleMenu,pinToScalePlacement} from '../../src/ui/object-tree-model';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorId} from '../../src/domain/indicators';

// Several indicators share one extra price scale (Pin to scale > an existing scale, beside the new right and
// new left scales) through LV-VELA-SCALE-GROUPS-1 (COMPAT-10). The port runs on the pinned core with the installed renderer;
// SYNTHETIC bars. Menu wording for existing scales is our own choice. No GUI claim.
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
async function core(stripGroups=false){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;if(stripGroups){t.native.lvIndicatorScaleGroup=undefined;t.native.lvIndicatorScaleHolder=undefined;}return {t,port,close(){port.dispose();t.dispose();}};}
type Host=Awaited<ReturnType<typeof core>>;
let A:Host,B:Host,C:Host;
beforeAll(async()=>{A=await core();B=await core();C=await core(true);});
afterAll(()=>{for(const host of [A,B,C])host.close();});
afterEach(()=>{for(const host of [A,B,C])for(const row of host.port.list())host.port.remove(row.id);vi.unstubAllGlobals();});
const add=(port:any,kind:IndicatorId)=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,factory.inputs,factory) as string;};
const nativeOf=(port:any,id:string)=>port.list().find((row:any)=>row.id===id).rendererId as string;
const saved=(port:any,id:string)=>port.serialize().find((row:any)=>row.id===id);
const valuesJson=(port:any,id:string)=>JSON.stringify(port.values(id).series.map((s:any)=>s.values));

describe('Pin to scale > an existing scale (indicator port)',()=>{
 it('joins the scale of another indicator: one group named by the target, one right column, both saved, values unchanged',()=>{
  const {port,t}=A,sma=add(port,'sma'),ema=add(port,'ema'),bb=add(port,'bb'),before=valuesJson(port,ema);
  port.setScale(sma,'own');port.setScale(bb,'own');
  expect(t.native.maxOwnScaleColumns()).toBe(2);
  port.setScale(ema,{scaleOf:sma});
  expect(port.scale(ema)).toMatchObject({placement:'own',pinned:true,group:sma});expect(port.scale(sma)).toMatchObject({placement:'own',group:sma});expect(port.scale(bb).group).toBeUndefined();
  expect(readIndicatorScaleHolder(t.chart,nativeOf(port,ema))).toBe(nativeOf(port,sma));
  expect(t.native.maxOwnScaleColumns()).toBe(2);// sma+ema share one column, bb has its own
  expect(saved(port,ema)).toMatchObject({ownScale:true,scaleGroup:sma});expect(saved(port,sma)).toMatchObject({ownScale:true,scaleGroup:sma});
  expect(Object.hasOwn(saved(port,bb),'scaleGroup')).toBe(false);expect(Object.hasOwn(saved(port,ema),'scalePlacement')).toBe(false);
  expect(valuesJson(port,ema)).toBe(before);
  // A third member joins through any member; the group keeps its name.
  port.setScale(bb,{scaleOf:ema});expect(port.scale(bb).group).toBe(sma);expect(t.native.maxOwnScaleColumns()).toBe(1);
  // Pin to new right scale leaves the group; shared drops the group from the save.
  port.setScale(bb,'own');expect(port.scale(bb).group).toBeUndefined();expect(Object.hasOwn(saved(port,bb),'scaleGroup')).toBe(false);expect(t.native.maxOwnScaleColumns()).toBe(2);
  port.setScale(ema,'shared');expect(Object.hasOwn(saved(port,ema),'scaleGroup')).toBe(false);expect(readIndicatorScaleGroup(t.chart,nativeOf(port,ema))).toBeNull();
 });
 it('lists the existing extra scales of the pane, named by their other indicators, with the current one checked',()=>{
  const {port}=A,sma=add(port,'sma'),ema=add(port,'ema'),bb=add(port,'bb');
  const title=(id:string)=>id===sma?'SMA':id===ema?'EMA':'BB';
  expect(port.scaleChoices(sma,title)).toEqual([]);// shared: no extra scale on the pane yet
  port.setScale(sma,'own');port.setScale(bb,'left');
  const byTarget=(list:any[])=>[...list].sort((x,y)=>x.target<y.target?-1:1);
  expect(byTarget(port.scaleChoices(ema,title))).toEqual(byTarget([{target:sma,side:'own',members:[sma],titles:['SMA'],current:false},{target:bb,side:'left',members:[bb],titles:['BB'],current:false}]));
  expect(port.scaleChoices(sma,title).map((c:any)=>c.target)).toEqual([bb]);// its own lone scale is the "new" row, not a choice
  port.setScale(ema,{scaleOf:bb});
  const current=port.scaleChoices(bb,title).find((c:any)=>c.current);expect(current).toMatchObject({target:ema,side:'left',titles:['EMA'],current:true});
  expect(port.scale(ema)).toMatchObject({placement:'left',group:bb});expect(saved(port,ema)).toMatchObject({ownScale:true,scalePlacement:'left',scaleGroup:bb});
  // Pinning to the scale it is already on is a no-op that keeps the group.
  port.setScale(bb,{scaleOf:current!.target});expect(port.scale(bb)).toMatchObject({placement:'left',group:bb});
 });
 it('refuses itself, a shared or axis-free target, another pane and an unknown id, changing nothing',()=>{
  const {port}=A,sma=add(port,'sma'),ema=add(port,'ema'),rsi=add(port,'rsi');
  const snapshot=()=>JSON.stringify(port.serialize());
  port.setScale(rsi,'own');const before=snapshot();
  expect(()=>port.setScale(sma,{scaleOf:sma})).toThrow('cannot share its own scale');
  expect(()=>port.setScale(sma,{scaleOf:ema})).toThrow('no extra scale to share');
  port.setScale(ema,'none');const none=snapshot();expect(()=>port.setScale(sma,{scaleOf:ema})).toThrow('no extra scale to share');expect(snapshot()).toBe(none);
  expect(snapshot()).not.toBe(before);port.setScale(ema,'shared');const shared=snapshot();
  expect(()=>port.setScale(sma,{scaleOf:rsi})).toThrow('same pane');
  expect(()=>port.setScale(sma,{scaleOf:'missing'})).toThrow('Unknown indicator instance');
  expect(snapshot()).toBe(shared);
 });
 it('restore re-creates the shared scale; a renderer without groups keeps the saved group and refuses a new join with the gap',()=>{
  const {port}=A,sma=add(port,'sma'),ema=add(port,'ema');port.setScale(sma,'left');port.setScale(ema,{scaleOf:sma});
  const snapshot=JSON.parse(JSON.stringify(port.serialize()));
  B.port.restore(snapshot);
  expect(B.port.serialize()).toEqual(snapshot);expect(B.port.scale(ema)).toMatchObject({placement:'left',group:sma});
  expect(readIndicatorScaleHolder(B.t.chart,nativeOf(B.port,ema))).toBe(nativeOf(B.port,sma));expect(B.t.native.lvLeftScaleWidth()).toBe(64);
  C.port.restore(snapshot);
  expect(C.port.serialize()).toEqual(snapshot);expect(C.port.scale(ema)).toMatchObject({placement:'left',pinned:true});expect(C.port.scale(ema).group).toBeUndefined();
  expect(C.port.scaleChoices(ema)).toEqual([]);
  const third=add(C.port,'bb');expect(()=>C.port.setScale(third,{scaleOf:sma})).toThrow(INDICATOR_SCALE_GROUP_GAP);
 });
 it('a pane move clears the group with the pin',()=>{
  const {port}=A,sma=add(port,'sma'),ema=add(port,'ema'),rsi=add(port,'rsi');port.setScale(sma,'own');port.setScale(ema,{scaleOf:sma});
  port.move(ema,{pane:(port.list().find((row:any)=>row.id===rsi) as any).paneId as string});
  expect(port.scale(ema).pinned).toBe(false);expect(Object.hasOwn(saved(port,ema),'scaleGroup')).toBe(false);expect(readIndicatorScaleGroup(A.t.chart,nativeOf(port,ema))).toBeNull();
 });
});

describe('Pin to scale submenu and saved records',()=>{
 const choices=[{target:'i2',side:'own' as const,members:['i2','i3'],titles:['EMA','BB'],current:false},{target:'i4',side:'left' as const,members:['i4','i1'],titles:['RSI'],current:true}];
 it('adds the new right scale and each existing extra scale after the reference rows; a shared scale unchecks the new rows',()=>{
  expect(pinToScaleMenu('own',{left:true,none:true}).map(row=>[row.id,row.label,!!row.checked])).toEqual([
   ['pin-shared','Pinned to right scale',false],['pin-left','Pin to new left scale',false],['pin-none','No scale (fullscreen)',false],['pin-own','Pin to new right scale',true]]);
  const menu=pinToScaleMenu('left',{left:true,none:true},choices);
  expect(menu.map(row=>[row.id,row.label,!!row.checked,!!row.disabled])).toEqual([
   ['pin-shared','Pinned to right scale',false,false],['pin-left','Pin to new left scale',false,false],['pin-none','No scale (fullscreen)',false,false],['pin-own','Pin to new right scale',false,false],
   ['pin-scale:i2','Pin to right scale with EMA, BB',false,false],['pin-scale:i4','Pinned to left scale with RSI',true,false]]);
  expect(pinToScaleMenu(null,{left:true,none:true},choices).every(row=>row.disabled)).toBe(true);
  expect(pinToScalePlacement('pin-scale:i2')).toEqual({scaleOf:'i2'});expect(pinToScalePlacement('pin-own')).toBe('own');expect(()=>pinToScalePlacement('pin-scale:')).toThrow('Unknown scale placement');
 });
 it('a saved scaleGroup needs an own right or left scale; records without it load unchanged',()=>{
  const base={id:'i1',kind:'sma',inputs:{},plots:{},offset:0,visible:true,paneId:'price'};
  expect(()=>validateIndicatorSettings({...base,ownScale:true,scaleGroup:'i2'},true)).not.toThrow();
  expect(()=>validateIndicatorSettings({...base,ownScale:true,scalePlacement:'left',scaleGroup:'i2'},true)).not.toThrow();
  expect(()=>validateIndicatorSettings({...base,ownScale:true},true)).not.toThrow();
  for(const bad of [{ownScale:false,scaleGroup:'i2'},{scaleGroup:'i2'},{ownScale:true,scalePlacement:'none',scaleGroup:'i2'},{ownScale:true,scaleGroup:''},{ownScale:true,scaleGroup:7}])
   expect(()=>validateIndicatorSettings({...base,...bad},true),JSON.stringify(bad)).toThrow();
  expect(()=>validateIndicatorSettings({...base,ownScale:true,scaleGroup:'i2'},false)).toThrow();
 });
});

describe('Merge all scales into one with a shared scale',()=>{
 it('pins every member back, not only the column holders',()=>{
  const element=()=>({className:'',style:{} as Record<string,string>,attributes:{} as Record<string,string>,children:[] as unknown[],dataset:{} as Record<string,string>,textContent:'' as string|null,
   setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},remove(){}});
  vi.stubGlobal('document',{createElement:()=>element()});
  const merged:string[][]=[];const h=priceScaleHarness({mergeScales:ids=>{merged.push([...ids]);}});
  h.renderer.wrapper={clientWidth:0,clientHeight:0,appendChild(){}};h.renderer.plot=element();
  // SYNTHETIC scene lists: holders a (right, shared with b) and l (left); n is axis-free.
  const scene=h.renderer.scene;scene.ownScaleIndicatorsForPane=()=>[{id:'a'}];scene.lvLeftScaleIndicatorsForPane=()=>[{id:'l'}];
  scene.lvPrivateScaleIndicatorsForPane=()=>[{id:'a'},{id:'b'},{id:'l'},{id:'n'}];scene.lvScalePlacements=new Map([['l','left'],['n','none']]);
  h.port.bindHost({commitSettings:()=>true});
  expect(h.port.execute('mergeRight')).toEqual({ok:true});expect(merged).toEqual([['a','l','b']]);
 });
});
