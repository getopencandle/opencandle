import {describe,expect,it} from 'vitest';
import {
 commitDrawingVisibility,defaultDrawingVisibilityV2,drawingVisibility,makeDrawingVisibility,validateDrawingVisibility,validateDrawingVisibilityRule,validateDrawingVisibilityV2,
 visibilityTabModel,visibilityV2Candidate,VISIBILITY_BOUNDS,VISIBILITY_CUSTOM_NOTICE,createDrawingVisibilityProjection,type DrawingIntervalVisibilityV2,
} from '../../src/chart/drawing-visibility';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

// lvIntervalVisibility schemaVersion 2. Units and bounds
// follow VDD#dialog.common.visibility.*. v1 rows load and evaluate unchanged; an older validator
// meeting v2 keeps the row retained as an unavailable diagnostic. Synthetic rows.
const row=(extra:Record<string,unknown>={})=>({id:'a',type:'trendline',anchors:[{time:1000,price:1},{time:2000,price:2}],visible:true,...extra});
const v2=(patch:Partial<DrawingIntervalVisibilityV2>={}):DrawingIntervalVisibilityV2=>({...defaultDrawingVisibilityV2(),...patch});
const shows=(rule:unknown,resolution:string)=>drawingVisibility(row({lvIntervalVisibility:rule}),resolution).visible;

describe('v2 schema and bounds',()=>{
 it('the default is checked with the full range for every unit',()=>{
  const rule=defaultDrawingVisibilityV2();
  expect(rule).toEqual({schemaVersion:2,ticks:true,seconds:{enabled:true,from:1,to:59},minutes:{enabled:true,from:1,to:59},hours:{enabled:true,from:1,to:24},days:{enabled:true,from:1,to:366},weeks:{enabled:true,from:1,to:52},months:{enabled:true,from:1,to:12},ranges:true});
  expect(VISIBILITY_BOUNDS).toEqual({seconds:[1,59],minutes:[1,59],hours:[1,24],days:[1,366],weeks:[1,52],months:[1,12]});
  expect(validateDrawingVisibilityV2(rule)).toEqual(rule);
  expect(shows(rule,'1m')).toBe(true);expect(shows(rule,'1D')).toBe(true);expect(shows(rule,'1T')).toBe(true);expect(shows(rule,'1R')).toBe(true);
 });
 it.each(Object.entries(VISIBILITY_BOUNDS))('%s refuses a range outside its bounds, a reversed range and non-integers',(unit,[low,high])=>{
  const base=defaultDrawingVisibilityV2() as unknown as Record<string,unknown>;
  for(const range of [{enabled:true,from:low-1,to:high},{enabled:true,from:low,to:high+1},{enabled:true,from:high,to:low===high?low-1:low},{enabled:true,from:1.5,to:high},{enabled:'yes',from:low,to:high},{enabled:true,from:low}])
   expect(()=>validateDrawingVisibilityV2({...base,[unit]:range})).toThrow();
  expect(validateDrawingVisibilityV2({...base,[unit]:{enabled:false,from:low,to:low}})).toBeTruthy();
 });
 it('refuses unknown keys, missing keys, wrong flags and accessors',()=>{
  const base=defaultDrawingVisibilityV2() as unknown as Record<string,unknown>;
  for(const value of [{...base,future:true},{...base,ticks:'on'},{...base,ranges:undefined},{...base,schemaVersion:1},(()=>{const copy={...base};delete copy.hours;return copy;})(),[],null,Object.defineProperty({...base},'ticks',{get:()=>true,enumerable:true})])
   expect(()=>validateDrawingVisibilityV2(value)).toThrow();
 });
 it('the two future shapes the existing suite uses still stay unavailable',()=>{
  for(const value of [{schemaVersion:2},{schemaVersion:2,future:true}])expect(drawingVisibility(row({lvIntervalVisibility:value}),'5m')).toMatchObject({visible:false,diagnostic:{code:'DRAWING_VISIBILITY_UNAVAILABLE'}});
 });
});

describe('v2 evaluation and the resolution to unit mapping',()=>{
 it('minutes use their range, hours are minute intervals divisible by 60, other minute intervals above 59 have no unit',()=>{
  const rule=v2({minutes:{enabled:true,from:5,to:15},hours:{enabled:true,from:2,to:4}});
  expect([shows(rule,'1m'),shows(rule,'5m'),shows(rule,'15m'),shows(rule,'30m')]).toEqual([false,true,true,false]);
  expect([shows(rule,'60m'),shows(rule,'120m'),shows(rule,'180m'),shows(rule,'240m')]).toEqual([false,true,true,true]);
  expect(shows(v2({ticks:false}),'90m')).toBe(false);// 90 is not an hour multiple and exceeds the minutes bound, so no v2 unit shows it
 });
 it('disabled units hide, ticks and ranges are checkboxes, days weeks and months map to their own range',()=>{
  expect(shows(v2({seconds:{enabled:false,from:1,to:59}}),'5s')).toBe(false);
  expect(shows(v2({ticks:false}),'1T')).toBe(false);expect(shows(v2({ticks:false}),'1m')).toBe(true);
  expect(shows(v2({ranges:false}),'10R')).toBe(false);
  expect([shows(v2({days:{enabled:true,from:2,to:5}}),'1D'),shows(v2({weeks:{enabled:true,from:2,to:5}}),'3W'),shows(v2({months:{enabled:true,from:3,to:12}}),'1M'),shows(v2({months:{enabled:true,from:3,to:12}}),'6M')]).toEqual([false,true,false,true]);
 });
 it('the default rule is unrestricted, so an unknown declared interval does not make it unavailable',()=>{
  expect(drawingVisibility(row({lvIntervalVisibility:defaultDrawingVisibilityV2()}))).toEqual({visible:true});
  expect(drawingVisibility(row({lvIntervalVisibility:v2({ticks:false})}))).toMatchObject({visible:false,diagnostic:{code:'DRAWING_VISIBILITY_UNAVAILABLE'}});
 });
 it('the renderer projection evaluates v2 per resolution without changing the canonical rule',()=>{
  const canonical=[row({lvIntervalVisibility:v2({minutes:{enabled:true,from:5,to:15}})})],before=JSON.stringify(canonical);let resolution='1m',native:Record<string,unknown>[]=[];
  const projection=createDrawingVisibilityProjection({read:()=>canonical,resolution:()=>resolution,push:rows=>{native=rows;}});
  projection.sync(structuredClone(canonical));expect(native[0].visible).toBe(false);resolution='15m';projection.sync(structuredClone(canonical));expect(native[0].visible).toBe(true);expect(JSON.stringify(canonical)).toBe(before);
 });
});

describe('v1 compatibility and retention',()=>{
 it('v1 rows validate and evaluate exactly as before, and the strict v1 validator rejects v2 (the older-build path)',()=>{
  const v1=makeDrawingVisibility('include',['5m']);
  expect(validateDrawingVisibilityRule(v1)).toEqual(v1);expect(validateDrawingVisibility(v1)).toEqual(v1);
  expect(shows(v1,'5m')).toBe(true);expect(shows(v1,'15m')).toBe(false);
  expect(()=>validateDrawingVisibility(defaultDrawingVisibilityV2())).toThrow('Unsupported interval visibility schema');
  expect(validateDrawingVisibilityRule(v2())).toEqual(v2());
 });
 it('an older-build validator meeting v2 keeps the row retained as an unavailable diagnostic, not dropped or rewritten',()=>{
  // Simulates the previous build: a projection whose rules are read with the strict v1 validator.
  const rule=v2({minutes:{enabled:true,from:5,to:15}}),stored:Record<string,unknown>[]=[row({lvIntervalVisibility:rule})];
  let retainedError='';try{validateDrawingVisibility(stored[0].lvIntervalVisibility);}catch(error){retainedError=String(error);}
  expect(retainedError).toContain('Unsupported interval visibility schema');
  expect(stored[0].lvIntervalVisibility).toEqual(rule);// the stored bytes are untouched by the failed read
 });
 it('commitDrawingVisibility writes v2 for the chosen rows only, round-trips JSON, and rolls back on a failed projection',()=>{
  let document:Record<string,unknown>={version:1,drawings:[row(),{...row(),id:'b'},{id:'opaque',type:'future',payload:1}]},notified=0,fail=false;
  const host={read:()=>structuredClone(document),write:(next:Record<string,unknown>)=>{document=next;},project:()=>{if(fail){fail=false;throw Error('SYNTHETIC projection');}},notify:()=>{notified++;},known:(type:string)=>type==='trendline'};
  const rule=v2({hours:{enabled:true,from:1,to:12}}),original=structuredClone(document);
  commitDrawingVisibility(host,['a'],rule);
  expect((document.drawings as any[])[0].lvIntervalVisibility).toEqual(rule);expect(JSON.stringify((document.drawings as any[])[1])).toBe(JSON.stringify((original.drawings as any[])[1]));expect((document.drawings as any[])[2]).toEqual((original.drawings as any[])[2]);expect(notified).toBe(1);
  expect(JSON.parse(JSON.stringify(document))).toEqual(document);expect(validateDrawingVisibilityRule((document.drawings as any[])[0].lvIntervalVisibility)).toEqual(rule);
  const stored=structuredClone(document);fail=true;expect(()=>commitDrawingVisibility(host,['b'],v2({ticks:false}))).toThrow('SYNTHETIC projection');expect(document).toEqual(stored);expect(notified).toBe(1);
  expect(()=>commitDrawingVisibility(host,['a'],{schemaVersion:2} as never)).toThrow();
 });
});

describe('Visibility tab model ',()=>{
 it('rows follow the fact order and bounds; an absent rule shows the default and is editable',()=>{
  const tab=visibilityTabModel(undefined);
  expect(tab.readOnly).toBe(false);expect(tab.notice).toBeUndefined();
  expect(tab.rows.map(item=>[item.unit,item.label])).toEqual([['ticks','Ticks'],['seconds','Seconds'],['minutes','Minutes'],['hours','Hours'],['days','Days'],['weeks','Weeks'],['months','Months'],['ranges','Ranges']]);
  expect(tab.rows.find(item=>item.unit==='hours')).toMatchObject({enabled:true,from:1,to:24,bounds:[1,24]});
  expect(tab.rows.find(item=>item.unit==='ticks')).toEqual({unit:'ticks',label:'Ticks',enabled:true,optional:true});
 });
 it('a v1 rule that v2 can express exactly maps and stays editable; the shown interval set is identical',()=>{
  for(const v1 of [makeDrawingVisibility('all',[]),makeDrawingVisibility('include',['5m']),makeDrawingVisibility('include',['1D']),makeDrawingVisibility('include',['1h','2h','3h','4h'])]){
   const tab=visibilityTabModel(v1);expect(tab.readOnly).toBe(false);
   for(const resolution of ['1T','1s','1m','5m','15m','60m','120m','240m','1D','1W','1M','1R'])expect(shows(tab.rule,resolution)).toBe(shows(v1,resolution));
  }
  expect(visibilityV2Candidate(makeDrawingVisibility('include',['5m'])).rule.minutes).toEqual({enabled:true,from:5,to:5});
 });
 it('a v1 list v2 cannot express opens read-only with the notice, and Reset writes the v2 default',()=>{
  const odd=makeDrawingVisibility('include',['1','15']),tab=visibilityTabModel(odd);
  expect(tab.readOnly).toBe(true);expect(tab.notice).toBe('This drawing uses a custom interval list. Reset to edit by ranges.');expect(tab.notice).toBe(VISIBILITY_CUSTOM_NOTICE);
  expect(tab.reset).toEqual(defaultDrawingVisibilityV2());
  // Saving never changes the effective visibility of an interval the user did not edit: nothing is written until Reset.
  expect(shows(odd,'1m')).toBe(true);expect(shows(odd,'5m')).toBe(false);expect(shows(odd,'15m')).toBe(true);
  expect(visibilityTabModel(makeDrawingVisibility('exclude',['5m'])).readOnly).toBe(true);
 });
 it('an unreadable stored rule opens read-only rather than silently editable',()=>{
  expect(visibilityTabModel({schemaVersion:3,future:true}).readOnly).toBe(true);expect(visibilityTabModel({schemaVersion:2}).readOnly).toBe(true);
 });
});

describe('visibility v2 through the actual adapter host',()=>{
 it('the single-drawing edit writes a v2 rule in one history step and the renderer projection follows it',async()=>{
  const f=await templateAdapterHarness();try{
   const id=f.rows[0].id,rule=v2({minutes:{enabled:true,from:5,to:15}});
   f.edit(id,{},undefined,undefined,rule as never);
   expect((f.document.all().find(item=>item.id===id) as any).lvIntervalVisibility).toEqual(rule);
   expect((f.projection().find(item=>item.id===id) as any).visible).toBe(false);// the harness resolution is 1m
   expect(f.document.undo()).toBe(true);expect((f.document.all().find(item=>item.id===id) as any).lvIntervalVisibility).toBeUndefined();expect(f.document.undo()).toBe(false);
  }finally{f.native.dispose();}
 });
});
