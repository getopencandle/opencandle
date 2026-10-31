import {beforeEach,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {validateIndicatorSnapshots} from '../../src/chart/indicator-settings';
import {readIndicatorScalePlacement,indicatorScaleSides} from '../../src/chart/indicator-scale';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {findAll,text} from './indicator-real-port-harness';

// SCALEX section 5: Left scale and No scale in the Indicators dialog,
// kept by the indicator port, saved in the snapshot (scalePlacement beside ownScale) and applied on restore. The
// installed @luxalgo/vela 0.8.4 renderer with LV-VELA-SCALE-PLACEMENT-1 (COMPAT-5) and the pinned core
// (tests/chart/native-core-harness.ts); actual IndicatorSettings handlers under a hook model. SYNTHETIC bars. No GUI,
// browser layout or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
beforeEach(()=>{hooks.cells=[];});
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
async function core(){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;return {t,port,close(){port.dispose();t.dispose();}};}
const nativeOf=(port:any,id:string)=>port.list().find((row:any)=>row.id===id).rendererId as string;

/** The Placement tab of the actual editor on the real port and renderer; onScale is the dialog's act route. */
function editor(a:Awaited<ReturnType<typeof core>>,id:string){
 const library=createIndicatorLibrary();
 const props:any={chart:{indicators:a.port,chart:a.t.chart},library,assertCurrent:()=>{},getLibrary:()=>library,onLibraryChange:()=>true,
  onApply:(patch:any)=>{a.port.update(id,patch);return true;},onMove:(target:any)=>{a.port.move(id,target);return true;},onScale:(placement:any)=>{a.port.setScale(id,placement);return true;}};
 const render=()=>{hooks.cursor=0;return IndicatorSettings({...props,row:a.port.list().find((row:any)=>row.id===id)}) as any;};
 const button=(name:string)=>findAll(render(),node=>node.type==='button'&&text(node)===name)[0];
 const status=()=>text(findAll(render(),node=>node.type==='p'&&node.props.role==='status').at(-1));
 button('Placement').props.onClick();
 return {render,button,status};
}

it('SCALEX 5: Left scale and No scale are enabled in the dialog, apply through the port and are reported',async()=>{
 const a=await core();try{
  const factory=factoryIndicatorDefault('rsi'),id=a.port.add('rsi',factory.inputs,factory) as string,nativeId=nativeOf(a.port,id);
  const ui=editor(a,id);
  expect(ui.button('Left scale').props.disabled,'Left scale is offered on the patched renderer').toBeFalsy();
  ui.button('Left scale').props.onClick();
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('left');
  expect(a.port.scale(id).placement).toBe('left');
  expect(ui.status()).toBe('Indicator uses a left scale.');
  expect(text(ui.render())).toContain('Current scale: Left scale (chosen here)');
  expect(ui.button('Left scale').props.disabled,'the current side is not offered again').toBe(true);
  ui.button('No scale').props.onClick();
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('none');
  expect(ui.status()).toBe('Indicator has no scale (full-height overlay).');
  ui.button('Use the pane scale').props.onClick();
  expect(readIndicatorScalePlacement(a.t.chart,nativeId)).toBe('shared');expect(ui.status()).toBe('Indicator uses the shared scale of its pane.');
 }finally{a.close();}
});

it('SCALEX 5: left and none persist through save (serialize + snapshot validation) and restore into a new chart',async()=>{
 const a=await core(),b=await core();try{
  const f=(kind:'rsi'|'macd')=>{const d=factoryIndicatorDefault(kind);return a.port.add(kind,d.inputs,d) as string;};
  const left=f('rsi'),none=f('macd');
  a.port.setScale(left,'left');a.port.setScale(none,'none');
  const saved=JSON.parse(JSON.stringify(a.port.serialize()));
  const byKind=(kind:string)=>saved.find((row:any)=>row.kind===kind);
  expect(byKind('rsi')).toMatchObject({ownScale:true,scalePlacement:'left'});
  expect(byKind('macd')).toMatchObject({ownScale:true,scalePlacement:'none'});
  expect(()=>validateIndicatorSnapshots(saved)).not.toThrow();
  b.port.restore(saved);
  const restored=(kind:string)=>b.port.list().find((row:any)=>row.kind===kind)!.id;
  expect(readIndicatorScalePlacement(b.t.chart,nativeOf(b.port,restored('rsi')))).toBe('left');
  expect(readIndicatorScalePlacement(b.t.chart,nativeOf(b.port,restored('macd')))).toBe('none');
  expect(b.port.serialize().map((row:any)=>row.scalePlacement).sort()).toEqual(['left','none']);
  // shared and own keep their old snapshot shape (no scalePlacement field)
  b.port.setScale(restored('rsi'),'own');
  expect(b.port.serialize().find((row:any)=>row.kind==='rsi')).not.toHaveProperty('scalePlacement');
  // invalid saved placements are refused
  const bad=(patch:object)=>()=>validateIndicatorSnapshots([{...byKind('rsi'),...patch}]);
  expect(bad({scalePlacement:'top'})).toThrow();expect(bad({ownScale:false})).toThrow();
  const {scalePlacement:_drop,...plain}=byKind('rsi');expect(()=>validateIndicatorSnapshots([plain])).not.toThrow();
 }finally{a.close();b.close();}
});

it('BLR-9: a pre-SCALEX snapshot (ownScale, no scalePlacement) restores as own and re-serializes without scalePlacement',async()=>{
 const a=await core(),b=await core();try{
  const d=factoryIndicatorDefault('rsi'),id=a.port.add('rsi',d.inputs,d) as string;a.port.setScale(id,'own');
  const legacy=JSON.parse(JSON.stringify(a.port.serialize()));
  expect(legacy[0]).toMatchObject({ownScale:true});expect(legacy[0]).not.toHaveProperty('scalePlacement');
  expect(()=>validateIndicatorSnapshots(legacy)).not.toThrow();
  b.port.restore(legacy);
  const row=b.port.list()[0];
  expect(readIndicatorScalePlacement(b.t.chart,nativeOf(b.port,row.id))).toBe('own');
  expect(b.port.scale(row.id).placement).toBe('own');
  const again=b.port.serialize();expect(again[0]).toMatchObject({ownScale:true});expect(again[0]).not.toHaveProperty('scalePlacement');
  // and a snapshot with neither field stays shared
  const c=await core();try{const plain=JSON.parse(JSON.stringify(c.port.serialize()));expect(plain).toEqual([]);}finally{c.close();}
 }finally{a.close();b.close();}
});
it('BLR-9: a saved left/none restored on a renderer without those sides falls back per indicator to its own pane scale and says so',async()=>{
 const a=await core(),b=await core();try{
  const d=factoryIndicatorDefault('rsi'),id=a.port.add('rsi',d.inputs,d) as string;a.port.setScale(id,'left');
  const saved=JSON.parse(JSON.stringify(a.port.serialize()));
  (b.t.chart as any).orchestrator.renderer.lvIndicatorScalePlacement=undefined;// a renderer lacking the sides
  expect(indicatorScaleSides(b.t.chart)).toEqual({left:false,none:false});
  // BLR-9 per-indicator fallback (WIRING plan): the rest restores, this indicator runs on its own pane scale, the
  // restore says so, and the saved left side is kept for a renderer that has it.
  const result=b.port.restore(saved) as {changed:boolean;notices?:string[]};
  expect(result.notices?.join(' ')).toContain('A left-side scale is unavailable: this chart renderer cannot place an indicator on a left scale.');
  expect(b.port.list()).toHaveLength(1);const row=b.port.list()[0];
  expect(readIndicatorScalePlacement(b.t.chart,nativeOf(b.port,row.id))).toBe('own');
  expect(b.port.scale(row.id).fallback).toBe('left');
  expect(b.port.serialize()[0]).toMatchObject({ownScale:true,scalePlacement:'left'});
 }finally{a.close();b.close();}
});
