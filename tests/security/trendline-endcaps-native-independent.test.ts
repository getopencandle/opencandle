import {it,expect} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {nativeDrawingHarness,drawingProjection} from '../chart/drawing-native-harness';

type Command={op:string;values:number[];color?:string};
function paths(commands:Command[]){
 const strokes:Command[][]=[],triangles:Command[][]=[];let path:Command[]=[];
 for(const command of commands){
  if(command.op==='beginPath')path=[];
  else if(['moveTo','lineTo','closePath'].includes(command.op))path.push(command);
  else if(command.op==='stroke')strokes.push([...path]);
  else if(command.op==='fill')triangles.push([...path]);
 }
 return{strokes,triangles};
}
const first=[20,200],second=[260,100];
const row=(left:boolean,right:boolean,extendLeft=false,extendRight=false)=>createDrawing('trendline',{id:'SYNTHETIC native endcap oracle',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid',arrowLeft:left,arrowRight:right,extendLeft,extendRight}})!.serialize();
function triangleAt(path:Command[],tip:number[],from:number[]){
 expect(path.map(command=>command.op)).toEqual(['moveTo','lineTo','lineTo','closePath']);
 expect(path[0].values).toEqual(tip);
 const dx=tip[0]-from[0],dy=tip[1]-from[1],distance=Math.hypot(dx,dy),along=[dx/distance,dy/distance];
 const wings=path.slice(1,3).map(command=>[command.values[0]-tip[0],command.values[1]-tip[1]]);
 for(const wing of wings){expect(Math.hypot(...wing)).toBeCloseTo(9,10);expect(wing[0]*along[0]+wing[1]*along[1]).toBeLessThan(0);}
 const sides=wings.map(wing=>along[0]*wing[1]-along[1]*wing[0]);expect(sides[0]*sides[1]).toBeLessThan(0);expect(sides[0]+sides[1]).toBeCloseTo(0,10);
}

it.each([[false,false],[false,true],[true,false],[true,true]])('native Trendline arrow flags left=%s right=%s produce exact opposite-anchor canvas tips',async(left,right)=>{
 const native=await nativeDrawingHarness();try{
  const record=row(left,right);native.controller.fromJSON({version:1,drawings:[record]});
  const model=native.controller.store.get(record.id),output=paths(native.paint(record.id));
  expect(model.style.arrowLeft).toBe(left);expect(model.style.arrowRight).toBe(right);
  expect(output.strokes).toHaveLength(1);expect(output.strokes[0].map(command=>command.values)).toEqual([first,second]);
  expect(output.triangles).toHaveLength(Number(left)+Number(right));
  let ordinal=0;if(right)triangleAt(output.triangles[ordinal++],second,first);if(left)triangleAt(output.triangles[ordinal++],first,second);
 }finally{native.dispose();}
});

it.each([[true,false],[false,true],[true,true]])('native line extension left=%s right=%s changes stroke bounds while retaining both original arrow tips',async(extendLeft,extendRight)=>{
 const native=await nativeDrawingHarness();try{
  const baseline=row(true,true);native.controller.fromJSON({version:1,drawings:[baseline]});const before=paths(native.paint(baseline.id));
  const extended=row(true,true,extendLeft,extendRight);native.controller.fromJSON({version:1,drawings:[extended]});const after=paths(native.paint(extended.id));
  expect(after.strokes).toHaveLength(1);expect(after.triangles).toHaveLength(2);expect(after.triangles).toEqual(before.triangles);
  const stroke=after.strokes[0];expect(stroke[0].values[0]).toBe(extendLeft?-2:first[0]);expect(stroke[1].values[0]).toBe(extendRight?drawingProjection.width+2:second[0]);
  expect(stroke.map(command=>command.values)).not.toEqual(before.strokes[0].map(command=>command.values));
  triangleAt(after.triangles[0],second,first);triangleAt(after.triangles[1],first,second);
 }finally{native.dispose();}
});
