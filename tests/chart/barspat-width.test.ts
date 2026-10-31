import {describe,expect,it} from 'vitest';
import {decodeBars,encodeBars,type PatternBar,type PatternColumns} from '../../src/chart/lv-types/bars-pattern-data';
import {BARS_PATTERN_MODES,patternPrimitives,type PatternFrame} from '../../src/chart/lv-types/bars-pattern-geometry';

// Rule: a re-sampled pattern of ANY bar count fills the stored span from the left anchor to the right anchor
// (spec 2.2 ordinal slots; spec 3.1 stretch rule). SYNTHETIC bars.
const cols=(bars:PatternBar[])=>decodeBars(encodeBars(bars)) as PatternColumns;
const series=(n:number)=>Array.from({length:n},(_,i)=>{const o=100+Math.sin(i/3)*5,c=o+Math.cos(i/2);return{time:i*60,open:o,high:Math.max(o,c)+1,low:Math.min(o,c)-1,close:c};});
const frame=(over:Partial<PatternFrame>={}):PatternFrame=>({x0:100,x1:300,anchorPrice:100,refPrice:100,mirrored:false,flipped:false,mode:0,dpr:1,yOf:p=>500-2*p,...over});
function extent(c:PatternColumns,f:PatternFrame){
 const p=patternPrimitives(c,f)!;const xs:number[]=[];
 if(p.kind==='bars'&&p.box)xs.push(p.box.x0,p.box.x1);
 else if(p.kind==='bars')for(let i=0;i<p.segments.length;i+=3)xs.push(p.segments[i]);else for(let i=0;i<p.points.length;i+=2)xs.push(p.points[i]);
 return[Math.min(...xs),Math.max(...xs)];
}
describe('a pattern of any bar count spans anchor to anchor',()=>{
 for(const n of [1,2,3,11,5000]){
  for(const mode of [BARS_PATTERN_MODES.Bars,BARS_PATTERN_MODES.OpenClose,BARS_PATTERN_MODES.Line,BARS_PATTERN_MODES.LineHL2]){
   for(const dpr of [1,2]){
    it(`N=${n} mode ${mode} dpr ${dpr}`,()=>{
     const f=frame({mode,dpr,x0:100.5,x1:300.25}),[l,r]=extent(cols(series(n)),f),tol=0.5/dpr+1e-9;
     expect(Math.abs(l-f.x0)).toBeLessThanOrEqual(tol);expect(Math.abs(r-f.x1)).toBeLessThanOrEqual(tol);
    });
   }
  }
 }
});

describe('N=1 draws one bar whose body spans anchor to anchor (owner ruling 2026-10-17)',()=>{
 it('bar modes: one bar (one segment entry) with a box from x0 to x1 and a high-to-low extent',()=>{
  for(const mode of [BARS_PATTERN_MODES.Bars,BARS_PATTERN_MODES.OpenClose]){
   const c=cols(series(1)),f=frame({mode,x0:100.5,x1:300.25}),p=patternPrimitives(c,f)! as {kind:'bars';segments:Float64Array;box?:{x0:number;x1:number}};
   expect(p.segments.length).toBe(3);expect(p.box).toEqual({x0:100.5,x1:300.5}); // device pixel centres at dpr 1
   const f2=frame({mode,x0:100.3,x1:300.6,dpr:2}),p2=patternPrimitives(c,f2)! as {box:{x0:number;x1:number}};
   expect(p2.box).toEqual({x0:100.25,x1:300.75}); // snapped to device pixel centres at dpr 2
  }
 });
 it('line modes stay a flat line from x0 to x1; two or more bars have no box',()=>{
  const line=patternPrimitives(cols(series(1)),frame({mode:BARS_PATTERN_MODES.Line}))! as {points:Float64Array};
  expect(Array.from(line.points).filter((_,i)=>i%2===0)).toEqual([100,300]);expect(line.points[1]).toBe(line.points[3]);
  expect((patternPrimitives(cols(series(2)),frame())! as {box?:unknown}).box).toBeUndefined();
 });
});
