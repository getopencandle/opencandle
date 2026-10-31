import {expect,it} from 'vitest';
import {createTrendlineStatisticsSource,type TrendlineStatisticsSourceBasis} from '../../src/chart/trendline-stats-source';
import {calculateTrendlineStatistics} from '../../src/domain/trendline-statistics';
import type {Bar} from '../../src/domain/types';
import {nativeCoreHarness} from './native-core-harness';

const bars=():Bar[]=>[1000,1060,1180].map(time=>({time,open:10,high:12,low:9,close:11,volume:5}));
function fixture(){
 let basis:TrendlineStatisticsSourceBasis={epoch:{},source:{},bars:bars(),style:'candles',temporal:true,disposed:false};
 const renderer={scene:{timezone:'America/New_York'}};
 const host={renderer,readBasis:()=>({...basis})};
 const bridge=createTrendlineStatisticsSource(host);
 return{host,renderer,bridge,get basis(){return basis;},set basis(value:TrendlineStatisticsSourceBasis){basis=value;}};
}
const anchors=[{time:1000000,price:10},{time:1120000,price:12}];

it('reuses a stable lease and reads no bar records before a bars metric requests the grid',()=>{
 const t=fixture();let reads=0;t.basis={...t.basis,bars:new Proxy(bars(),{ownKeys(){reads++;throw Error('Should not read grid');}})};
 const first=t.bridge.capture();expect(t.bridge.capture()).toBe(first);expect(first.identity).toBe(t.bridge.capture().identity);
 expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.identity)).toBe(true);first.assertCurrent();
 expect(calculateTrendlineStatistics(anchors,{timezone:first.timezone,requested:['priceRange','dateTimeRange']}).priceRange).toEqual({state:'available',value:2});expect(reads).toBe(0);
});
it('prepares one detached exact prefix and preserves gaps and the source timestamp timezone',()=>{
 const t=fixture();let scans=0;t.basis={...t.basis,bars:new Proxy(bars(),{ownKeys(target){scans++;return Reflect.ownKeys(target);}})};
 const lease=t.bridge.capture(),first=lease.readGrid();expect(first.state).toBe('available');if(first.state!=='available')throw Error('Expected prepared grid');
 expect(lease.readGrid()).toBe(first);expect(t.bridge.capture().readGrid()).toBe(first);expect(scans).toBe(1);
 expect(calculateTrendlineStatistics(anchors,{grid:first.grid,timezone:lease.timezone}).barsRange).toEqual({state:'available',value:1.5});
 t.basis.bars[1].time=1010;expect(calculateTrendlineStatistics(anchors,{grid:first.grid}).barsRange).toEqual({state:'available',value:1.5});
 // Direct in-place mutation is not an adapter operation. The detached helper cannot grant live-source authority to it.
 expect(first.grid.count).toBe(3);expect(lease.timezone).toBe('America/New_York');
});
it.each(['epoch','source','bars','style','temporal'] as const)('%s replacement permanently retires the old lease, even after restoring its previous tuple',key=>{
 const t=fixture(),before=t.basis,old=t.bridge.capture();
 t.basis={...before,[key]:key==='bars'?[...before.bars]:key==='style'?'line':key==='temporal'?false:{}};
 expect(()=>old.assertCurrent()).toThrow();const next=t.bridge.capture();expect(next.identity).not.toBe(old.identity);
 t.basis=before;expect(()=>old.assertCurrent()).toThrow('retired');expect(()=>next.assertCurrent()).toThrow();
});
it('same-value attempted mutation uses the adapter epoch and creates a new grid owner',()=>{
 const t=fixture(),first=t.bridge.capture(),grid=first.readGrid();t.basis={...t.basis,epoch:{}};
 const next=t.bridge.capture();expect(next.identity).not.toBe(first.identity);expect(next.readGrid()).not.toBe(grid);expect(()=>first.readGrid()).toThrow();
});
it('rejects native timezone accessors without invoking them and cannot revive the old descriptor lease',()=>{
 const t=fixture(),old=t.bridge.capture();let reads=0;const descriptor=Object.getOwnPropertyDescriptor(t.renderer.scene,'timezone')!;
 Object.defineProperty(t.renderer.scene,'timezone',{configurable:true,enumerable:true,get(){reads++;return'UTC';}});
 expect(()=>old.assertCurrent()).toThrow();expect(()=>t.bridge.capture()).toThrow('data');expect(reads).toBe(0);
 Object.defineProperty(t.renderer.scene,'timezone',descriptor);expect(()=>old.assertCurrent()).toThrow('retired');expect(t.bridge.capture().timezone).toBe('America/New_York');
});
it('missing or invalid timezone withholds only formatted endpoints, retaining elapsed time and price values',()=>{
 for(const timezone of [undefined,'Not/A_Zone']){const t=fixture();if(timezone===undefined)Reflect.deleteProperty(t.renderer.scene,'timezone');else t.renderer.scene.timezone=timezone;
  const source=t.bridge.capture(),values=calculateTrendlineStatistics(anchors,{timezone:source.timezone});
  expect(values.dateTimeLabels.state).toBe('unavailable');expect(values.dateTimeRange).toEqual({state:'available',value:{startMs:1000000,endMs:1120000,elapsedMs:120000}});expect(values.priceRange).toEqual({state:'available',value:2});
 }
});
it('unadmitted topology does not read rows or invent a uniform bar cadence',()=>{
 const t=fixture();let reads=0;t.basis={...t.basis,temporal:false,bars:new Proxy(bars(),{ownKeys(){reads++;throw Error('No rows allowed');}})};
 const source=t.bridge.capture(),grid=source.readGrid();expect(grid).toMatchObject({state:'unavailable',reason:expect.stringContaining('topology')});expect(source.readGrid()).toBe(grid);expect(reads).toBe(0);
});
it('grid preparation cannot memoize or return through a replaced source',()=>{
 const t=fixture();let changed=false;t.basis={...t.basis,bars:new Proxy(bars(),{ownKeys(target){if(!changed){changed=true;t.basis={...t.basis,epoch:{}};}return Reflect.ownKeys(target);}})};
 const old=t.bridge.capture();expect(()=>old.readGrid()).toThrow();expect(()=>old.readGrid()).toThrow('retired');const next=t.bridge.capture();expect(next.readGrid().state).toBe('available');expect(next.identity).not.toBe(old.identity);
});
it('error formatting that replaces the source cannot publish a cached unavailable result',()=>{
 const t=fixture(),failure={toString(){t.basis={...t.basis,epoch:{},bars:bars()};return'bad imported grid';}};
 t.basis={...t.basis,bars:new Proxy(bars(),{ownKeys(){throw failure;}})};const old=t.bridge.capture();
 expect(()=>old.readGrid()).toThrow();expect(()=>old.assertCurrent()).toThrow('retired');expect(t.bridge.capture().readGrid().state).toBe('available');
});
it('bounds and caches ordinary invalid-grid diagnostics without inventing values',()=>{
 const t=fixture();t.basis={...t.basis,bars:[...bars()].reverse()};const source=t.bridge.capture(),result=source.readGrid();
 expect(result.state).toBe('unavailable');if(result.state==='unavailable')expect(result.reason.length).toBeLessThanOrEqual(240);expect(source.readGrid()).toBe(result);
});
it('refuses borrowed receivers, changed host callbacks, accessor basis fields and disposed sources',()=>{
 const t=fixture(),source=t.bridge.capture();expect(()=>source.assertCurrent.call({...source})).toThrow('receiver');expect(()=>source.readGrid.call({...source})).toThrow('receiver');
 let calls=0;t.host.readBasis=()=>{calls++;return t.basis;};expect(()=>source.assertCurrent()).toThrow();expect(calls).toBe(0);
 const other=fixture();let getters=0;other.host.readBasis=()=>Object.defineProperty({...other.basis},'epoch',{enumerable:true,get(){getters++;return{};}});const bridge=createTrendlineStatisticsSource(other.host);expect(()=>bridge.capture()).toThrow('data');expect(getters).toBe(0);
 const final=fixture(),lease=final.bridge.capture();final.bridge.dispose();expect(()=>lease.readGrid()).toThrow();expect(()=>final.bridge.capture()).toThrow('disposed');
});
it('rejects recursive source capture and requires a fresh valid owner after native scene replacement',()=>{
 let bridge:ReturnType<typeof createTrendlineStatisticsSource>;const t=fixture(),host={renderer:t.renderer,readBasis:()=>{bridge.capture();return t.basis;}};bridge=createTrendlineStatisticsSource(host);expect(()=>bridge.capture()).toThrow('already active');
 const first=t.bridge.capture();t.renderer.scene={timezone:'America/New_York'};expect(()=>first.assertCurrent()).toThrow();expect(t.bridge.capture().identity).not.toBe(first.identity);
});
it('pins the actual installed native scene timezone without reading its getConfig snapshot',async()=>{
 const native=await nativeCoreHarness();try{const basis=fixture().basis;let calls=0;const renderer=native.native as any;renderer.getConfig=()=>{calls++;throw Error('Do not clone cosmetics');};renderer.scene.timezone='UTC';
  const bridge=createTrendlineStatisticsSource({renderer,readBasis:()=>basis}),source=bridge.capture();expect(source.timezone).toBe('UTC');source.assertCurrent();expect(source.readGrid().state).toBe('available');expect(calls).toBe(0);renderer.scene.timezone='America/Phoenix';expect(()=>source.assertCurrent()).toThrow();expect(bridge.capture().timezone).toBe('America/Phoenix');bridge.dispose();
 }finally{native.dispose();}
});
