import {beforeEach,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {DOMAIN_INDICATORS} from '../../src/chart/indicator-settings';
import {INDICATOR_SCALE_GAPS} from '../../src/chart/indicator-scale';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {find,findAll,text} from '../ui/indicator-real-port-harness';
import type {IndicatorId} from '../../src/domain/indicators';

// L1 phase 2: scale placement through the real port against the ORIGINAL pinned Vela core/renderer
// (tests/chart/native-core-harness.ts) and the actual settings handlers. Not a DOM/packaged GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const scopes=new Map<string,any[]>();const renderIn=<T,>(scope:string,fn:()=>T):T=>{if(!scopes.has(scope))scopes.set(scope,[]);hooks.cells=scopes.get(scope)!;hooks.cursor=0;return fn();};
beforeEach(()=>scopes.clear());
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
const overlay=new Set<IndicatorId>(['sma','ema','bb','vwap']);
async function core(){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;return {t,port,close(){port.dispose();t.dispose();}};}
const add=(port:any,kind:IndicatorId)=>{const factory=factoryIndicatorDefault(kind);return port.add(kind,factory.inputs,factory) as string;};
const sceneOwn=(t:any,port:any,id:string)=>t.native.scene.indicators.get(port.list().find((row:any)=>row.id===id).rendererId)?.ownScale===true;

it.each([...DOMAIN_INDICATORS])('SCALE_PLACEMENT %s: pin to a separate scale and back to the pane scale on the actual renderer; values unchanged; pin survives edits and restart; a pane move clears it',async kind=>{
 const a=await core();try{
  const id=add(a.port,kind),partner=add(a.port,kind==='rsi'?'macd':'rsi'),before=a.port.values(id);
  expect(a.port.scale(id)).toMatchObject({ownScale:false,pinned:false,supported:true});expect(a.port.list()[0].paneId===('price')).toBe(overlay.has(kind));
  a.port.setScale(id,'own');expect(a.port.scale(id)).toMatchObject({ownScale:true,pinned:true});expect(sceneOwn(a.t,a.port,id)).toBe(true);expect(a.port.serialize()[0].ownScale).toBe(true);expect(a.port.values(id)).toEqual(before);
  const inputs=factoryIndicatorDefault(kind).inputs,key=Object.keys(inputs).find(name=>typeof inputs[name]==='number'&&!name.startsWith('band'));
  const edit=kind==='vwap'?{source:'close'}:kind==='obv'?{smoothingType:'SMA'}:{[key!]:(inputs[key!] as number)+1},undo=Object.fromEntries(Object.keys(edit).map(name=>[name,inputs[name]]));
  a.port.update(id,{inputs:edit});expect(a.port.values(id)).not.toEqual(before);expect(a.port.scale(id).ownScale).toBe(true);expect(sceneOwn(a.t,a.port,id)).toBe(true);// a re-emission keeps the pin
  a.port.update(id,{inputs:undo});expect(a.port.values(id)).toEqual(before);
  expect(a.port.scale(partner)).toMatchObject({ownScale:false,pinned:false});
  const saved=JSON.parse(JSON.stringify(a.port.serialize()));
  a.port.setScale(id,'shared');expect(a.port.scale(id)).toMatchObject({ownScale:false,pinned:true});expect(sceneOwn(a.t,a.port,id)).toBe(false);expect(a.port.serialize()[0].ownScale).toBe(false);
  const b=await core();try{b.port.restore(saved);expect(b.port.scale(id)).toMatchObject({ownScale:true,pinned:true});expect(b.port.serialize()).toEqual(saved);expect(b.port.values(id)).toEqual(before);}finally{b.close();}
  // Merging into the partner's pane gives the renderer's natural separate scale and clears the pin; the pane scale can then be chosen there.
  a.port.move(id,{pane:a.port.list()[1].paneId!});expect(a.port.scale(id)).toMatchObject({ownScale:true,pinned:false});expect(Object.hasOwn(a.port.serialize()[0],'ownScale')).toBe(false);
  a.port.setScale(id,'shared');expect(a.port.scale(id).ownScale).toBe(false);expect(a.port.scale(partner).ownScale).toBe(false);expect(a.port.list()[0].paneId).toBe(a.port.list()[1].paneId);expect(a.port.values(id)).toEqual(before);
  expect(()=>a.port.setScale(id,'top' as any)).toThrow(/shared, own, left or none/);expect(a.port.scale(id).ownScale).toBe(false);// Left and none are valid sides now (tests/ui/bugfix-l-indicator-scale-sides.test.ts)
 }finally{a.close();}
});

it('SCALE_PLACEMENT validation: snapshots accept only a boolean ownScale and unsupported hosts refuse a pin explicitly',async()=>{
 const a=await core();try{const id=add(a.port,'rsi'),saved=a.port.serialize();
  expect(()=>a.port.restore([{...saved[0],ownScale:'right'} as any])).toThrow(/boolean/);expect(a.port.serialize()).toEqual(saved);
  expect(()=>a.port.add('sma',{},{ownScale:1} as any)).toThrow(/boolean/);expect(a.port.list()).toHaveLength(1);
 }finally{a.close();}
 const {realChart}=await import('../ui/indicator-real-port-harness');const host=realChart(),id=host.port.add('sma');
 expect(host.port.scale(id)).toMatchObject({supported:false,pinned:false});expect(()=>host.port.setScale(id,'own')).toThrow(/unavailable/);expect(host.port.serialize()[0]).not.toHaveProperty('ownScale');
});

it('SCALE_PLACEMENT dialog: the Placement tab pins the actual renderer scale, reports it, and offers left/no-scale on the patched renderer',async()=>{
 const a=await core();try{
  const id=add(a.port,'ema');let library=createIndicatorLibrary();
  const props:any={chart:{indicators:a.port,chart:a.t.chart,getCalculationBars:()=>rows.map(row=>({...row,time:row.time/1000}))},get instances(){return a.port.list();},get library(){return library;},ownerToken:{},onLibraryChange:(next:any)=>{library=next;return true;},onClose:()=>{},onChange:()=>true,initialSelected:id};
  const settings=()=>{const tree=renderIn('dialog',()=>IndicatorDialog({...props,instances:props.instances,library:props.library})),element=findAll(tree,node=>node.type===IndicatorSettings)[0];return renderIn('settings',()=>IndicatorSettings(element.props));};
  const button=(value:string)=>find(settings(),node=>node.type==='button'&&text(node)===value);
  button('Placement').props.onClick();expect(text(settings())).toContain('Current scale: Shared scale of this pane');expect(button('Use the pane scale').props.disabled).toBe(true);
  // The patched renderer draws left and no scale, so both are offered without a gap title.
  expect(button('Left scale').props).toMatchObject({disabled:false,title:undefined});expect(button('No scale').props).toMatchObject({disabled:false,title:undefined});
  button('Use a separate scale').props.onClick();expect(a.port.scale(id)).toMatchObject({ownScale:true,pinned:true});expect(text(settings())).toContain('Indicator uses a separate scale.');expect(text(settings())).toContain('Current scale: Separate scale (chosen here)');
  expect(button('Use a separate scale').props.disabled).toBe(true);button('Use the pane scale').props.onClick();expect(a.port.scale(id).ownScale).toBe(false);expect(text(settings())).toContain('Indicator uses the shared scale of its pane.');
 }finally{a.close();}
});

it('IND.SOURCE.MOVED on the actual renderer: pinning the source or the dependent to another scale keeps the dependent values identical',async()=>{
 const {encodeIndicatorSource}=await import('../../src/domain/indicator-source');
 const a=await core();try{
  const rsi=add(a.port,'rsi'),dependent=a.port.add('sma',{...factoryIndicatorDefault('sma').inputs,length:3,source:encodeIndicatorSource(rsi,'rsi')},factoryIndicatorDefault('sma')) as string;
  const before=a.port.values(dependent);expect(before.series[0].values.some(value=>value!==null)).toBe(true);
  a.port.setScale(rsi,'own');expect(a.port.scale(rsi).ownScale).toBe(true);expect(a.port.values(dependent)).toEqual(before);
  a.port.setScale(dependent,'own');expect(a.port.values(dependent)).toEqual(before);a.port.move(rsi,'price');expect(a.port.values(dependent)).toEqual(before);
 }finally{a.close();}
});
