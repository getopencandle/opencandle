import {describe,expect,it} from 'vitest';
import {planTrendlineMarkers,paintTrendlineMarkers} from '../../src/chart/trendline-markers-painter';
import {TRENDLINE_MARKERS_DEFAULTS} from '../../src/chart/trendline-stats-data';
// SYNTHETIC projection: x = time/10, y = 300 - price. The glyph and placement are our own choice.
const proj={xOf:(time:number)=>time/10,yOf:(price:number)=>300-price};
const anchors=[{time:1000,price:100},{time:3000,price:200}];
const bounds={left:0,right:400,top:0,bottom:300};
describe('trendline markers painter (middle point and price labels)',()=>{
 it('absent or default markers draw nothing, so a saved trendline paints identically',()=>{
  expect(planTrendlineMarkers(undefined,anchors,proj,bounds,{color:'#112233'})).toEqual([]);
  expect(planTrendlineMarkers(TRENDLINE_MARKERS_DEFAULTS,anchors,proj,bounds,{color:'#112233'})).toEqual([]);
 });
 it('middle point is one handle-sized dot at the segment midpoint',()=>{
  const ops=planTrendlineMarkers({...TRENDLINE_MARKERS_DEFAULTS,middlePoint:true},anchors,proj,bounds,{color:'#112233'});
  expect(ops).toEqual([{kind:'dot',x:200,y:150,radius:3,color:'#112233'}]);
 });
 it('price labels print both anchor prices on the price scale side',()=>{
  const ops=planTrendlineMarkers({...TRENDLINE_MARKERS_DEFAULTS,priceLabels:true},anchors,proj,bounds,{color:'#112233',format:price=>price.toFixed(2)});
  expect(ops).toEqual([
   {kind:'text',text:'100.00',x:396,y:200,align:'right',color:'#112233'},
   {kind:'text',text:'200.00',x:396,y:100,align:'right',color:'#112233'},
  ]);
 });
 it('draws nothing for non-finite projection and never throws',()=>{
  const broken={xOf:()=>NaN,yOf:(price:number)=>price};
  expect(planTrendlineMarkers({...TRENDLINE_MARKERS_DEFAULTS,middlePoint:true,priceLabels:true},anchors,broken,bounds,{color:'#112233'})).toEqual([]);
 });
 it('paints with balanced canvas state',()=>{
  const calls:string[]=[],ctx:any=new Proxy({},{get:(_,key)=>typeof key==='string'?(...args:unknown[])=>{calls.push(String(key)+(args.length?'('+args.join(',')+')':''));}:undefined,set:(_,key,value)=>{calls.push('set '+String(key)+'='+value);return true;}});
  paintTrendlineMarkers(ctx,[{kind:'dot',x:1,y:2,radius:3,color:'#fff'},{kind:'text',text:'1',x:5,y:6,align:'right',color:'#fff'}],{fontFamily:'sans-serif'});
  expect(calls.filter(call=>call==='save')).toHaveLength(1);expect(calls.filter(call=>call==='restore')).toHaveLength(1);
  expect(calls).toContain('fillText(1,5,6)');
 });
});
