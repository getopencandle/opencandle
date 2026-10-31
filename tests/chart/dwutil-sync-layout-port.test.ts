import {describe,expect,it} from 'vitest';
import {createLayoutPort,createLayoutSnapshot,replicateScopedDrawings,resolveDrawingSyncOn,mirrorLayoutDrawingSync,openLayoutLibraryEntry} from '../../src/chart/layout-port';
import type {ChartController} from '../../src/chart/adapter';

// (spec 3.7,): per-drawing sync scope replication and the single sync
// authority. Controllers are SYNTHETIC records of the layout port's narrow controller use.
type Row=Record<string,unknown>;
const scoped=(id:string,extra:Row={}):Row=>({id,type:'future-drawing',paneId:'price',lvSyncScope:'layout',...extra});
const local=(id:string):Row=>({id,type:'future-drawing',paneId:'price'});
function controller(initial:Row){
 let document=structuredClone(initial);const events:Record<string,Function>={},loads:Row[]=[];
 const port={chart:{on:(key:string,fn:Function)=>{events[key]=fn;return()=>{};},getVisibleRange:()=>null,renderer:{onCrosshairMove:(fn:Function)=>{events.crosshair=fn;return()=>{};},setExternalCrosshair:()=>{}}},
  onDrawingsChanged:(fn:Function)=>{events.drawings=fn;return()=>{};},saveDrawings:()=>structuredClone(document),loadDrawings:(next:Row)=>{loads.push(structuredClone(next));document=structuredClone(next);},resize:()=>{}};
 return{port:port as unknown as ChartController,events,loads,set:(next:Row)=>{document=structuredClone(next);},read:()=>document};
}
const ids=(value:Row)=>(value.drawings as Row[]).map(row=>row.id);
/** a, b, c share a drawing scope key; d is another symbol; c sits in another link group. */
function layout(options:{scopeKeys?:boolean;syncDrawings?:boolean}={}){
 const snapshot=createLayoutSnapshot(4,{cellIds:['a','b','c','d']});snapshot.cells[2].group='other';snapshot.cells[3].symbol='AMC';snapshot.sync.drawings=options.syncDrawings??false;
 const keys:Record<string,string>={a:'K-GME',b:'K-GME',c:'K-GME',d:'K-AMC'};
 const port=createLayoutPort(snapshot,options.scopeKeys===false?{}:{scopeKey:id=>keys[id]});
 const docs:Record<string,Row>={a:{version:1,drawings:[local('LA')]},b:{version:1,drawings:[local('LB')],lvDrawingManager:{schemaVersion:1,groups:[{id:'G',name:'g',memberIds:['LB']}],templates:[]}},c:{version:1,drawings:[local('LC')]},d:{version:1,drawings:[local('LD')]}};
 const charts=Object.fromEntries(Object.entries(docs).map(([id,value])=>[id,controller(value)]));
 for(const [id,chart] of Object.entries(charts))port.mount(id,chart.port);
 return{port,charts};
}

describe('SYNC.LAYOUT_PORT',()=>{
 it('SYNC.LAYOUT_PORT.SCOPED replicates only scoped rows to every same-scope cell regardless of link group',()=>{
  const {charts}=layout();
  charts.a.set({version:1,drawings:[local('LA'),scoped('S1')]});charts.a.events.drawings();
  expect(ids(charts.b.read())).toEqual(['LB','S1']);expect(ids(charts.c.read())).toEqual(['LC','S1']);
  expect(charts.d.loads).toEqual([]);expect(charts.a.loads).toEqual([]);
  // A native edit of the scoped row reaches the peers in place; the local row never leaves its chart.
  charts.a.set({version:1,drawings:[scoped('S1',{anchors:[{time:5,price:6}]}),local('LA')]});charts.a.events.drawings();
  expect(charts.b.read().drawings).toEqual([local('LB'),scoped('S1',{anchors:[{time:5,price:6}]})]);
 });
 it('SYNC.LAYOUT_PORT.ERASE a removed scoped row leaves each peer and its group membership',()=>{
  const {charts}=layout();
  charts.a.set({version:1,drawings:[scoped('S1')]});charts.a.events.drawings();
  charts.b.set({...charts.b.read(),lvDrawingManager:{schemaVersion:1,groups:[{id:'G',name:'g',memberIds:['LB','S1']}],templates:[]}});
  charts.a.set({version:1,drawings:[]});charts.a.events.drawings();
  expect(ids(charts.b.read())).toEqual(['LB']);expect((charts.b.read().lvDrawingManager as any).groups[0].memberIds).toEqual(['LB']);expect(ids(charts.c.read())).toEqual(['LC']);
 });
 it('SYNC.LAYOUT_PORT.NO_SCOPE unscoped edits produce no peer load even with the legacy switch on',()=>{
  const {charts}=layout({syncDrawings:true});
  charts.a.set({version:1,drawings:[local('LA'),local('LA2')]});charts.a.events.drawings();
  for(const id of ['b','c','d'])expect(charts[id].loads).toEqual([]);
 });
 it('SYNC.LAYOUT_PORT.SYMBOL_FALLBACK without a scope resolver, peers are the same-symbol cells',()=>{
  const {charts}=layout({scopeKeys:false});
  charts.a.set({version:1,drawings:[scoped('S1')]});charts.a.events.drawings();
  expect(ids(charts.b.read())).toContain('S1');expect(ids(charts.c.read())).toContain('S1');expect(charts.d.loads).toEqual([]);
 });
 it('SYNC.LAYOUT_PORT.PURE replicateScopedDrawings keeps peer order, retains malformed managers untouched, and reports no change as null',()=>{
  const target={version:1,drawings:[local('L1'),scoped('S1'),local('L2')]};
  expect(replicateScopedDrawings({version:1,drawings:[scoped('S1')]},target)).toBe(null);
  expect(ids(replicateScopedDrawings({version:1,drawings:[scoped('S2'),scoped('S1',{x:1})]},target)!)).toEqual(['L1','S1','L2','S2']);
  expect(replicateScopedDrawings({version:1,drawings:[]},{...target,lvDrawingManager:{schemaVersion:9}})).toBe(null);
  expect(createLayoutSnapshot(2).sync).toEqual({symbol:false,interval:false,crosshair:false,time:false,dateRange:false,drawings:false});
 });
});

describe('SYNC.AUTHORITY ()',()=>{
 const utility=(syncOn:boolean)=>({schemaVersion:1,syncOn});
 it('SYNC.AUTHORITY.MIGRATION a saved workspace without drawingUtility keeps its layout switch',()=>{
  const off=createLayoutSnapshot(1),on=createLayoutSnapshot(1);on.sync.drawings=true;
  expect(resolveDrawingSyncOn(off,undefined)).toBe(false);expect(resolveDrawingSyncOn(on,undefined)).toBe(true);
 });
 it('SYNC.AUTHORITY.SINGLE once drawingUtility exists the layout switch is ignored on load and mirrored on save',()=>{
  const stored=createLayoutSnapshot(1);stored.sync.drawings=true;
  expect(resolveDrawingSyncOn(stored,utility(false))).toBe(false);
  const saved=mirrorLayoutDrawingSync(stored,false);expect(saved.sync.drawings).toBe(false);expect(stored.sync.drawings).toBe(true);
  expect(mirrorLayoutDrawingSync(saved,false)).toEqual(saved);
 });
 it('SYNC.AUTHORITY.RELOAD save then load then save is byte-stable',()=>{
  const layout=createLayoutSnapshot(2,{id:'L',cellIds:['x','y']}),first=JSON.stringify(mirrorLayoutDrawingSync(layout,true));
  const reloaded=JSON.parse(first),syncOn=resolveDrawingSyncOn(reloaded,utility(true));
  expect(JSON.stringify(mirrorLayoutDrawingSync(reloaded,syncOn))).toBe(first);
 });
 it('SYNC.AUTHORITY.LIBRARY opening a library entry ignores its stored drawings switch once drawingUtility exists',()=>{
  const entry=createLayoutSnapshot(2,{id:'E',cellIds:['p','q']});entry.sync.drawings=true;entry.sync.symbol=true;
  const opened=openLayoutLibraryEntry(entry,utility(false));
  expect(opened.syncOn).toBe(false);expect(opened.layout.sync).toEqual({...entry.sync,drawings:false});expect(entry.sync.drawings).toBe(true);
  // Legacy library entry opened before migration: its switch is still the migration input.
  expect(openLayoutLibraryEntry(entry,undefined).syncOn).toBe(true);
 });
});
