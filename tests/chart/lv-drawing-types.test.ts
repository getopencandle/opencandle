import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createDrawing,deserializeDrawing,drawingTypes,getDrawingType} from '@luxalgo/vela';
import {LV_DATE_RANGE,LV_DRAWING_TYPE_IDS,LV_PRICE_RANGE,LV_SHORT_POSITION,lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {drawingCommands,drawingProjection,nativeDrawingHarness} from './drawing-native-harness';

// Synthetic projector: 1 px per second of time from t0, price p at y = 300 - p.
const T0=1_000_000;
const proj:any={width:400,height:300,xOf:(time:number)=>(time-T0)/1000,yOf:(price:number)=>300-price,pxToPoint:(x:number,y:number)=>({time:T0+x*1000,price:300-y})};
const placed=(type:string,second:{time:number;price:number})=>{const d:any=createDrawing(type as any,{paneId:'price',anchors:[{time:T0+50_000,price:100},second]})!;d.onPlaced(proj);return d;};
// The shared recorder lacks a few canvas calls the measure painter uses; record any missing call generically.
const paint=(t:any,id:string)=>{const record=drawingCommands(),ctx=new Proxy(record.ctx,{get:(target,key)=>key in target||typeof key!=='string'?Reflect.get(target,key):(...values:unknown[])=>{record.commands.push({op:key,values});return{addColorStop(){}};}});t.painter.paintAll(ctx,[t.controller.store.get(id)],drawingProjection,{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'});return record.commands;};
// Module types integrated after (, R1b), appended in registry order after the three original LV types.
const INTEGRATED:readonly (readonly [string,string])[]=[['lvelliotttriangle','elliottcorrection'],['lvelliottdoublecombo','elliottcorrection'],['lvelliotttriplecombo','elliottcorrection'],['lvanchoredvp','fixedrangevp'],['lvbarspattern','trendline'],['lvdoublecurve','curve'],['lvemoji','iconstamp'],['lvanchoredtext','text'],['lvimage','iconstamp']];
// Twelve modules appended after the fib-time-trend-line replacement (type, base, label, anchor min, anchor max).
const R24:readonly (readonly [string,string,string,number,number])[]=[['lvarrowmarker','triangle','Arrow marker',2,2],['lvtrianglepattern','elliottcorrection','Triangle pattern',4,4],['lvthreedrives','elliottcorrection','Three drives pattern',6,6],['lvtimecycles','triangle','Time cycles',2,2],['lvcycliclines','triangle','Cyclic lines',2,2],['lvsineline','triangle','Sine line',2,2],['lvpitchfan','triangle','Pitchfan',3,3],['lvgannsquarefixed','gannsquare','Gann square fixed',2,2],['lvpositionforecast','triangle','Position forecast',2,2],['lvsector','triangle','Sector',3,3],['lvghostfeed','polyline','Ghost feed',2,512],['lvpin','note','Pin',1,1],['lvtable','note','Table',1,1]];
const R24_IDS=R24.map(([type])=>type);
// The Stickers module appended after (type, base, label, anchor min, anchor max; min 1 so a click places it).
const R29:readonly (readonly [string,string,string,number,number])[]=[['lvsticker','box','Sticker',1,2]];
const R29_IDS=R29.map(([type])=>type);
const INTEGRATED_IDS=INTEGRATED.map(([type])=>type);
const texts=(commands:any[])=>commands.filter(command=>command.op==='fillText').map(command=>String(command.values[0]));

afterEach(()=>{vi.doUnmock('@luxalgo/vela');vi.resetModules();});

describe('OpenCandle drawing types on pinned native classes',()=>{
 it('registers every type against the installed renderer and exposes it in the drawing catalog',()=>{
  expect(lvDrawingTypeStatus().map(row=>[row.type,row.base,row.state])).toEqual([['position','position','registered'],[LV_SHORT_POSITION,'position','registered'],[LV_PRICE_RANGE,'datepricerange','registered'],[LV_DATE_RANGE,'datepricerange','registered'],...INTEGRATED.map(([type,base])=>[type,base,'registered']),['trendfibtime','trendfibtime','registered'],...R24.map(([type,base])=>[type,base,'registered']),...R29.map(([type,base])=>[type,base,'registered']),['fibchannel','fibchannel','registered'],...['hline','vline','crossline'].map(type=>[type,type,'registered'])]);// The axis-lines defaults replace these in place
  const types=drawingTypes().map(meta=>String(meta.type));for(const type of LV_DRAWING_TYPE_IDS)expect(types).toContain(type);
  const rows=drawingCatalog().filter(row=>(LV_DRAWING_TYPE_IDS as readonly string[]).includes(row.type));
  expect(rows.map(row=>[row.type,row.label,row.anchorSchema?.min,row.anchorSchema?.max])).toEqual([['hline','Horizontal Line',1,1],['vline','Vertical Line',1,1],['crossline','Cross Line',1,1],['fibchannel','Fib Channel',3,3],['trendfibtime','Trend-Based Fib Time',3,3],['position','Long/Short Position',2,2],[LV_SHORT_POSITION,'Short position',2,2],[LV_PRICE_RANGE,'Price range',2,2],[LV_DATE_RANGE,'Date range',2,2],['lvelliotttriangle','Elliott triangle wave (A·B·C·D·E)',5,5],['lvelliottdoublecombo','Elliott double combo wave (W·X·Y)',3,3],['lvelliotttriplecombo','Elliott triple combo wave (W·X·Y·X·Z)',5,5],['lvanchoredvp','Anchored volume profile',1,1],['lvbarspattern','Bars pattern',2,2],['lvdoublecurve','Double curve',4,4],['lvemoji','Emoji',1,1],['lvanchoredtext','Anchored text',1,1],['lvimage','Image',1,1],...R24.map(([type,,label,min,max])=>[type,label,min,max]),...R29.map(([type,,label,min,max])=>[type,label,min,max])]);
  expect(getDrawingType(LV_SHORT_POSITION)!.group).toBe(getDrawingType('position')!.group);
 });
 it('Short position: the default box faces short; an explicit second click keeps the native target rule',()=>{
  const native=placed('position',{time:T0+50_000,price:100}),short=placed(LV_SHORT_POSITION,{time:T0+50_000,price:100});
  expect(native.direction).toBe('long');expect(short.direction).toBe('short');
  expect(short.anchors).toHaveLength(3);const [entry,stop,target]=short.anchors;
  expect(target.price).toBeLessThan(entry.price);expect(stop.price).toBeGreaterThan(entry.price);
  // Mirror of the native default box: same distances on the other side of the entry.
  const [nEntry,nStop,nTarget]=native.anchors;expect(entry.price-target.price).toBeCloseTo(nTarget.price-nEntry.price,9);expect(stop.price-entry.price).toBeCloseTo(nEntry.price-nStop.price,9);
  expect(placed(LV_SHORT_POSITION,{time:T0+120_000,price:160}).direction).toBe('long');
  expect(placed(LV_SHORT_POSITION,{time:T0+120_000,price:40}).direction).toBe('short');
 });
 it('Short position round-trips through serialize/deserialize with its own type and the native settings',()=>{
  const short=placed(LV_SHORT_POSITION,{time:T0+50_000,price:100}),record=short.serialize();
  expect(record.type).toBe(LV_SHORT_POSITION);const back:any=deserializeDrawing(structuredClone(record))!;
  expect(back.type).toBe(LV_SHORT_POSITION);expect(back.serialize()).toEqual(record);expect(back.direction).toBe('short');
  expect(back.schema().fields.map((field:any)=>field.path)).toEqual(createDrawing('position',{paneId:'price'})!.schema().fields.map(field=>field.path));
 });
 it('Price range and Date range hide the other measure by default and keep an explicit retained choice',()=>{
  const price:any=createDrawing(LV_PRICE_RANGE as any,{paneId:'price',anchors:[{time:T0,price:100},{time:T0+60_000,price:110}]})!;
  const date:any=createDrawing(LV_DATE_RANGE as any,{paneId:'price',anchors:[{time:T0,price:100},{time:T0+60_000,price:110}]})!;
  expect([price.showPrice,price.showDate,date.showPrice,date.showDate]).toEqual([true,false,false,true]);
  expect(price.measureLabel(proj)).toEqual([price.priceLabel()]);expect(price.priceLabel()).toContain('%');expect(date.measureLabel(proj)).toEqual([date.timeLabel(proj)]);
  const kept:any=createDrawing(LV_PRICE_RANGE as any,{paneId:'price',props:{showPrice:true,showDate:true}})!;expect(kept.showDate).toBe(true);
  const record=price.serialize();expect(record.props).toEqual({showPrice:true,showDate:false});expect((deserializeDrawing(record) as any).showDate).toBe(false);
 });
 it('arms, creates and paints through the actual native controller and painter branches',async()=>{
  const t=await nativeDrawingHarness();try{
   const docs={
    [LV_SHORT_POSITION]:createDrawing(LV_SHORT_POSITION as any,{paneId:'price',anchors:[{time:T0+20_000,price:100},{time:T0+120_000,price:120},{time:T0+120_000,price:60}]})!.serialize(),
    [LV_PRICE_RANGE]:createDrawing(LV_PRICE_RANGE as any,{paneId:'price',anchors:[{time:T0+20_000,price:100},{time:T0+120_000,price:150}]})!.serialize(),
    [LV_DATE_RANGE]:createDrawing(LV_DATE_RANGE as any,{paneId:'price',anchors:[{time:T0+20_000,price:100},{time:T0+120_000,price:150}]})!.serialize(),
   };
   for(const [type,doc] of Object.entries(docs)){
    const events:Array<string|null>=[];const off=t.on('drawing:tool',({type:armed})=>events.push(armed));
    t.controller.setTool(type);expect(t.controller.getTool()).toBe(type);
    t.controller.onIntent({kind:'create',doc});t.controller.onIntent({kind:'tool-finished',type});off();
    expect(events).toEqual([type,null]);
    const created=t.controller.all().find((row:any)=>row.type===type)!;expect(created.anchors.length).toBe(doc.anchors.length);
    const painted=paint(t,created.id);expect(painted.length,type).toBeGreaterThan(0);
    const labels=texts(painted).join(' | ');
    // The LV position plates replace the native header (no direction word in the reference labels); the short box reads its ratio.
    if(type===LV_SHORT_POSITION){expect(labels).toContain('Risk/reward ratio: 2');expect(created.anchors[1].price).toBeGreaterThan(created.anchors[0].price);}
    if(type===LV_PRICE_RANGE){expect(labels).toContain('%');expect(labels).not.toContain('bars');}
    if(type===LV_DATE_RANGE)expect(labels).not.toContain('%');
   }
   expect(t.controller.canUndo()).toBe(true);
  }finally{t.dispose();}
 });
 it('registers before module-level drawingTypes() snapshots: both chart entry modules import it first',()=>{
  // ES modules evaluate imports before the importing body, so a first-position side-effect import in
  // drawing-port and drawing-document-bindings runs before src/ui/drawing-scopes.ts:15 (module-level
  // snapshot, imports drawing-document-bindings) and before adapter.ts:106 (imports drawing-port).
  const firstImport=(path:string)=>/^import\s+[^;]*;/m.exec(readFileSync(path,'utf8'))![0];
  expect(firstImport('src/chart/drawing-port.ts')).toBe("import './lv-drawing-types';");
  expect(firstImport('src/chart/drawing-document-bindings.ts')).toBe("import './lv-drawing-types';");
  const scopes=readFileSync('src/ui/drawing-scopes.ts','utf8');
  expect(scopes.indexOf("from '../chart/drawing-document-bindings'")).toBeGreaterThan(0);
  expect(scopes.indexOf("from '../chart/drawing-document-bindings'")).toBeLessThan(scopes.indexOf('const knownDrawings=new Set(drawingTypes()'));
  expect(readFileSync('src/chart/adapter.ts','utf8')).toContain("from './drawing-port'");
 });
 const isolatedRegistry=(override:{position?:(meta:any)=>any;preRegistered?:string[]}={})=>{
  const captured=new Map<string,any>();
  vi.doMock('@luxalgo/vela',async()=>{
   const actual:any=await vi.importActual('@luxalgo/vela');
   return{...actual,
    // 'position' is an LV id that replaces the native type and is also the base of Short, so the harness keeps its native entry.
    getDrawingType:(type:string)=>(LV_DRAWING_TYPE_IDS as readonly string[]).includes(type)&&type!=='position'?(override.preRegistered?.includes(type)?{type}:captured.get(type)):type==='position'&&override.position?override.position(actual.getDrawingType(type)):actual.getDrawingType(type),
    registerDrawingType:(meta:any)=>{captured.set(meta.type,meta);},
   };
  });
  return captured;
 };
 it('fails closed when the pinned native model changed: the type is not registered and reports why',async()=>{
  vi.resetModules();
  // Simulated upgrade: the position model gained another anchor.
  const captured=isolatedRegistry({position:meta=>({...meta,create:(init:any)=>{const model=meta.create(init);const schema=model.anchorSchema.bind(model);model.anchorSchema=()=>({...schema(),max:3});return model;}})});
  const mod=await import('../../src/chart/lv-drawing-types');
  const status=mod.lvDrawingTypeStatus();
  expect(status.find(row=>row.type===LV_SHORT_POSITION)).toMatchObject({state:'unavailable',reason:expect.stringContaining('pinned position model')});
  expect(status.filter(row=>row.state==='registered').map(row=>row.type)).toEqual([LV_PRICE_RANGE,LV_DATE_RANGE,...INTEGRATED_IDS,...R24_IDS,...R29_IDS]);
  expect([...captured.keys()]).toEqual([LV_PRICE_RANGE,LV_DATE_RANGE,...INTEGRATED_IDS,...R24_IDS,...R29_IDS]);
 });
 it('fails closed when another module instance already registered an id',async()=>{
  vi.resetModules();
  const captured=isolatedRegistry({preRegistered:[LV_DATE_RANGE]});
  const mod=await import('../../src/chart/lv-drawing-types');
  expect(mod.lvDrawingTypeStatus().find(row=>row.type===LV_DATE_RANGE)).toMatchObject({state:'unavailable',reason:expect.stringContaining('already registered')});
  // The shared registry already holds the LV Long position of the first module graph, so this instance's Long fails closed and Short builds on the native class.
  expect(mod.lvDrawingTypeStatus().find(row=>row.type==='position')).toMatchObject({state:'unavailable',reason:expect.stringContaining('already replaced')});
  expect([...captured.keys()]).toEqual([LV_SHORT_POSITION,LV_PRICE_RANGE,...INTEGRATED_IDS,...R24_IDS,...R29_IDS]);
 });
});
