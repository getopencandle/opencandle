import {createDrawing,type Projector} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import * as runtime from '../../src/chart/fib-trend-line-runtime';

it('a public-shaped acquisition callback cannot authorize a retained native model hit without annotation invocation',()=>{
 const drawing=createDrawing('fibretracement',{id:'SYNTHETIC forged projector',paneId:'price',createdAt:1,
  anchors:[{time:1000,price:100},{time:2000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true},reverse:false,levels:[{ratio:.25,color:'#123456',enabled:true},{ratio:.75,color:'#abcdef',enabled:true}]}})!;
 const projector={xOf:(time:number)=>time/10,yOf:(price:number)=>price} as unknown as Projector;
 expect(drawing.hitTest(50,50,projector,2)).toBe(false);
 let cleanup:unknown,unauthorizedHit=false;
 try{
  const bind=Reflect.get(runtime,'bindFibTrendLineProjector');
  cleanup=Reflect.apply(bind,undefined,[projector,()=>({points:Object.freeze({x1:0,y1:0,x2:100,y2:100}),assertCurrent(){},assertLocal(){},dispose(){}})]);
  unauthorizedHit=drawing.hitTest(50,50,projector,2);
 }catch{/* Refusing the forged registration or its use is valid. */}
 finally{if(typeof cleanup==='function')cleanup();}
 expect(unauthorizedHit).toBe(false);
 expect(drawing.hitTest(50,50,projector,2)).toBe(false);
});
