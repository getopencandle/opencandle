import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {captureDrawingBoundary,evaluateDrawingBoundary,validateDrawingBoundarySnapshot,prepareDrawingBoundaryGrid} from '../../src/chart/drawing-alert-geometry';
const dataset=fixtureDataset('GME',4),bars=dataset.bars.map((bar,index)=>({...bar,time:[0,60,180,240][index]})),context={source:sourceContextForDataset(dataset,bars),style:'candles',scale:'linear' as const};
const drawing=(type='trendline',anchors=[{time:0,price:100},{time:240000,price:130}],style={})=>({id:'line-1',type,paneId:'price',anchors,style});
function capture(value:unknown){const result=captureDrawingBoundary(value,bars,context);if(!result.ok)throw new Error(result.diagnostics.join('; '));return result.snapshot;}
it('captures equal-bar logical geometry across irregular sessions instead of elapsed-calendar prices',()=>{
 const snapshot=capture(drawing());expect(snapshot.anchors.map(anchor=>anchor.logical)).toEqual([0,3]);expect(evaluateDrawingBoundary(snapshot,2)).toEqual({ok:true,boundaryPrice:120});expect(evaluateDrawingBoundary(snapshot,2)).not.toEqual({ok:true,boundaryPrice:122.5});
 const fractional=capture(drawing('trendline',[{time:120000,price:10},{time:240000,price:16}]));expect(fractional.anchors[0].logical).toBe(1.5);expect(evaluateDrawingBoundary(fractional,2)).toEqual({ok:true,boundaryPrice:12});
});
it('preserves independent extensions, reversed ray chronology and inclusive endpoint domains',()=>{
 for(const [left,right] of [[false,false],[false,true],[true,false],[true,true]]){const snapshot=capture(drawing('trendline',undefined,{extendLeft:left,extendRight:right}));expect(evaluateDrawingBoundary(snapshot,-1).ok).toBe(left);expect(evaluateDrawingBoundary(snapshot,4).ok).toBe(right);expect(evaluateDrawingBoundary(snapshot,0).ok).toBe(true);expect(evaluateDrawingBoundary(snapshot,3).ok).toBe(true);}
 // 0.8.1: a ray drawn right to left runs from its first point to the left (the drawn direction).
 const reversed=capture(drawing('ray',[{time:240000,price:130},{time:60000,price:110}]));const start=reversed.anchors[0].logical;expect(reversed.domain).toEqual({min:null,max:start});expect(evaluateDrawingBoundary(reversed,start+1).ok).toBe(false);expect(evaluateDrawingBoundary(reversed,start)).toEqual({ok:true,boundaryPrice:130});expect(evaluateDrawingBoundary(reversed,0).ok).toBe(true);const extended=capture(drawing('extendedline'));expect(evaluateDrawingBoundary(extended,-1)).toEqual({ok:true,boundaryPrice:90});
});
it('horizontal line and ray retain their own domains, independent of visibility and lock',()=>{
 const line=capture({...drawing('hline',[{time:60000,price:7}]),visible:false,locked:true}),ray=capture(drawing('hray',[{time:60000,price:7}]));expect(evaluateDrawingBoundary(line,-100)).toEqual({ok:true,boundaryPrice:7});expect(evaluateDrawingBoundary(ray,0).ok).toBe(false);expect(evaluateDrawingBoundary(ray,1)).toEqual({ok:true,boundaryPrice:7});expect(evaluateDrawingBoundary(ray,99)).toEqual({ok:true,boundaryPrice:7});
});
it('rejects future anchors, vertical lines, ambiguous grids, unknown tools/panes and unresolved native logarithmic geometry',()=>{
 for(const value of [drawing('box'),{...drawing(),paneId:'secondary'},drawing('trendline',[{time:0,price:10},{time:0,price:20}]),drawing('ray',[{time:0,price:10},{time:300000,price:20}]),drawing('trendline',undefined,{extendLeft:'yes'})])expect(captureDrawingBoundary(value,bars,context).ok).toBe(false);
 expect(captureDrawingBoundary(drawing(),bars.map((bar,index)=>({...bar,time:index===2?60:bar.time})),context).ok).toBe(false);expect(captureDrawingBoundary(drawing(),bars,{...context,scale:'logarithmic'})).toMatchObject({ok:false,diagnostics:[expect.stringContaining('resolved positive')]});expect(captureDrawingBoundary(drawing(),bars,{...context,style:'renko'}).ok).toBe(false);
});
it('copies/freeze geometry, reads only supplied time grid and validates saved snapshots before evaluation',()=>{
 const original=drawing(),snapshot=capture(original);original.anchors[0].price=999;expect(snapshot.anchors[0].price).toBe(100);expect(Object.isFrozen(snapshot)).toBe(true);expect(Object.isFrozen(snapshot.anchors[0])).toBe(true);
 const prefix=bars.slice(0,3).map(bar=>{const result={...bar};Object.defineProperty(result,'close',{get(){throw new Error('OHLC not needed for geometry');}});return result;});expect(captureDrawingBoundary(drawing('hline',[{time:60000,price:7}]),prefix,context).ok).toBe(false); // Accessor-bearing records are rejected without executing it.
 const noTail=new Proxy(bars.slice(0,3),{get(target,key,receiver){if(key==='3')throw new Error('Future tail accessed');return Reflect.get(target,key,receiver);}});expect(captureDrawingBoundary(drawing('hline',[{time:60000,price:7}]),noTail,context).ok).toBe(true);
 expect(validateDrawingBoundarySnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);for(const patch of [{domain:{min:0,max:2}},{geometryFingerprint:'forged'},{anchors:[{time:0,price:1,logical:0}]}])expect(evaluateDrawingBoundary({...snapshot,...patch} as typeof snapshot,1).ok).toBe(false);
});
it('saved snapshot validation rejects coercion, serializers, array accessors and impossible grid lineage without executing them',()=>{
 const saved=JSON.parse(JSON.stringify(capture(drawing())));let executed=0;
 for(const mutate of [(value:typeof saved)=>{value.transform={toString(){executed++;return 'standard';}};},(value:typeof saved)=>{value.anchors[0].toJSON=()=>{executed++;return {};};},(value:typeof saved)=>{value.domain.toJSON=()=>{executed++;return {};};},(value:typeof saved)=>{Object.defineProperty(value.anchors,'0',{get(){executed++;return {};}});},(value:typeof saved)=>{value.gridOrigin=1e20;},(value:typeof saved)=>{value.anchors[0].time=-1;},(value:typeof saved)=>{value.anchors[0].logical=0.5;}]){const value=structuredClone(saved);mutate(value);expect(()=>validateDrawingBoundarySnapshot(value)).toThrow();}
 expect(executed).toBe(0);
});
it('a prepared batch retains one copied grid and never revisits input for each drawing capture',()=>{
 let reads=0;const prefix=new Proxy([...bars],{get(target,key,receiver){if(/^[0-9]+$/.test(String(key)))reads++;return Reflect.get(target,key,receiver);}}),prepared=prepareDrawingBoundaryGrid(prefix,context);if(!prepared.ok)throw new Error(prepared.diagnostics.join('; '));const before=reads;for(let index=0;index<100;index++)expect(prepared.grid.capture(drawing()).ok).toBe(true);expect(reads).toBe(before);expect(prepared.grid.logicalPosition(120)).toBe(1.5);expect(prepared.grid.logicalPosition(300)).toBeNull();bars[1].time=61;expect(prepared.grid.logicalPosition(120)).toBe(1.5);bars[1].time=60;
 const saved=JSON.parse(JSON.stringify(capture(drawing())));Object.defineProperty(saved.domain,'min',{value:0,enumerable:false});expect(()=>validateDrawingBoundarySnapshot(saved)).toThrow();
});
