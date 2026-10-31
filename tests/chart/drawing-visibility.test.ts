import {it,expect} from 'vitest';
import {makeDrawingVisibility,validateDrawingVisibility,drawingVisibility,createDrawingVisibilityProjection,commitDrawingVisibility} from '../../src/chart/drawing-visibility';
const row=(id='a')=>({id,type:'trendline',anchors:[{time:1000,price:100},{time:2000,price:120}],visible:true,lvIntervalVisibility:makeDrawingVisibility('include',['5m'])});
it('literal interval round trips preserve canonical intent, hidden state and minute/day distinction',()=>{
 const canonical=[row(),{...row('hidden'),visible:false}];let resolution='5m',native:Record<string,unknown>[]=[];const projection=createDrawingVisibilityProjection({read:()=>canonical,resolution:()=>resolution,push:rows=>{native=rows;}}),before=structuredClone(canonical);
 for(const [interval,expected]of [['5m',true],['1D',false],['5m',true]] as const){resolution=interval;projection.sync(canonical);expect(native.map(row=>row.visible)).toEqual([expected,false]);expect(canonical).toEqual(before);}
 expect(drawingVisibility({...row(),lvIntervalVisibility:makeDrawingVisibility('include',['1h'])},'60m').visible).toBe(true);expect(drawingVisibility({...row(),lvIntervalVisibility:makeDrawingVisibility('include',['1D'])},'1440m').visible).toBe(false);
});
it('group rules validate all members, publish once, preserve opaque records and undo by restoring the canonical snapshot',()=>{
 let document:Record<string,unknown>={version:1,drawings:[row(),row('b'),{id:'opaque',type:'future',payload:{retained:true}}],lvDrawingManager:{schemaVersion:1,groups:[{id:'group',name:'Group',memberIds:['a','b']}],templates:[]}},notified=0,projected=0;const original=structuredClone(document),host={read:()=>structuredClone(document),write:(next:Record<string,unknown>)=>{document=next;},project:()=>{projected++;},notify:()=>{notified++;},known:(type:string)=>type==='trendline'};
 expect(()=>commitDrawingVisibility(host,['a','opaque'],makeDrawingVisibility('include',['1D']))).toThrow('supported');expect(document).toEqual(original);expect(projected).toBe(0);
 commitDrawingVisibility(host,['a','b'],makeDrawingVisibility('include',['1D']));expect(notified).toBe(1);expect((document.drawings as any[])[2]).toEqual((original.drawings as any[])[2]);expect(document.lvDrawingManager).toEqual(original.lvDrawingManager);commitDrawingVisibility(host,['a','b'],makeDrawingVisibility('include',['1D']));expect(notified).toBe(1);
 host.write(original);host.project();expect(drawingVisibility((document.drawings as any[])[0],'5m').visible).toBe(true);expect(notified).toBe(1);
});
it('group projection failure restores canonical rules and never publishes partially changed members',()=>{
 let document:Record<string,unknown>={drawings:[row(),row('b')]};const before=structuredClone(document);let fail=true,notifications=0;const host={read:()=>structuredClone(document),write:(next:Record<string,unknown>)=>{document=next;},project:()=>{if(fail){fail=false;throw new Error('native');}},notify:()=>{notifications++;},known:()=>true};expect(()=>commitDrawingVisibility(host,['a','b'],makeDrawingVisibility('include',['1D']))).toThrow('native');expect(document).toEqual(before);expect(notifications).toBe(0);
});
it('a failed projection restores prior diagnostics together with the rendered snapshot',()=>{
 const canonical:Record<string,unknown>[]=[{...row(),lvIntervalVisibility:{schemaVersion:2}}];let reject=false;const projection=createDrawingVisibilityProjection({read:()=>canonical,resolution:()=> '5m',push:()=>{if(reject){reject=false;throw new Error('native');}}});projection.sync(canonical);const old=projection.diagnostics();expect(old).toHaveLength(1);
 canonical[0]=row();reject=true;expect(()=>projection.sync(canonical)).toThrow('native');expect(projection.diagnostics()).toEqual(old);
});
it('omitted SDK visibility stays omitted after projection and native geometry capture',()=>{
 const canonical={...row()};delete (canonical as any).visible;let native:Record<string,unknown>[]=[];const projection=createDrawingVisibilityProjection({read:()=>[canonical],resolution:()=> '1D',push:rows=>{native=rows;}});projection.sync([{...canonical,visible:true}]);expect(native[0].visible).toBe(false);
 const captured=projection.canonicalNativeRows([{...canonical,visible:true,anchors:[{time:1000,price:105},{time:2000,price:120}]}]);expect(Object.hasOwn(captured[0],'visible')).toBe(false);expect((captured[0].anchors as any[])[0].price).toBe(105);expect(projection.canonicalNativeRows([{...canonical,visible:false}])[0].visible).toBe(false);
});
it('unknown future rules and legacy bands remain retained and unavailable rather than silently shown',()=>{
 for(const extra of [{lvIntervalVisibility:{schemaVersion:2,future:true}},{showOn:['future-band']},{lvIntervalVisibility:{schemaVersion:1,mode:'include',resolutions:['not-interval']}}]){const canonical={...row(),...extra},before=structuredClone(canonical);expect(drawingVisibility(canonical,'5m')).toMatchObject({visible:false,diagnostic:{severity:'unavailable'}});expect(canonical).toEqual(before);}
 expect(drawingVisibility(row())).toMatchObject({visible:false,diagnostic:{code:'DRAWING_VISIBILITY_UNAVAILABLE'}});expect(drawingVisibility({id:'all',type:'text'})).toEqual({visible:true});
});
it('legacy band metadata stays separate while projection removes inferred native cadence filtering',()=>{
 const canonical={...row(),lvIntervalVisibility:makeDrawingVisibility('all',[]),showOn:['1']};let native:Record<string,unknown>[]=[];const projection=createDrawingVisibilityProjection({read:()=>[canonical],resolution:()=> '3m',push:rows=>{native=rows;}});projection.sync([canonical]);expect(native[0].visible).toBe(true);expect(Object.hasOwn(native[0],'showOn')).toBe(false);expect(canonical.showOn).toEqual(['1']);expect(drawingVisibility(canonical,'5m').visible).toBe(false);
});
it('a failed renderer projection restores the preceding visible snapshot without modifying source or rules',()=>{
 const canonical=[row()],before=structuredClone(canonical);let resolution='5m',native:Record<string,unknown>[]=[];const projection=createDrawingVisibilityProjection({read:()=>canonical,resolution:()=>resolution,push:rows=>{native=rows;if(rows[0]?.visible===false)throw new Error('native');}});projection.sync(canonical);resolution='1D';expect(()=>projection.sync(canonical)).toThrow('native');expect(native[0].visible).toBe(true);expect(canonical).toEqual(before);
});
it('rules have bounded canonical unique keys and explicit empty include/exclude behavior',()=>{
 expect(drawingVisibility({...row(),lvIntervalVisibility:makeDrawingVisibility('include',[])},'5m').visible).toBe(false);expect(drawingVisibility({...row(),lvIntervalVisibility:makeDrawingVisibility('exclude',[])},'5m').visible).toBe(true);
 for(const value of [{schemaVersion:1,mode:'include',resolutions:['1h']},{schemaVersion:1,mode:'all',resolutions:['5m']},{schemaVersion:1,mode:'include',resolutions:['5m','5m']},{schemaVersion:1,mode:'include',resolutions:Array(101).fill('5m')}])expect(()=>validateDrawingVisibility(value)).toThrow();
});
