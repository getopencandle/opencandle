import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {fibBaselineHarness} from './fib-trend-line-painter-harness';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';

// Fib paint timing harness. Opt-in: set LV_FIB_TIMING=1.
// Measures the owned Fibonacci presentation paint with the factory 24-level drawing
// through the actual annotation/painter route: a placement rubber-band frame, a
// committed render and body-drag moves. Prints medians to stderr; retains no files.
// It asserts behavior only (no timing threshold), so machine speed never fails it.
const enabled=!!process.env.LV_FIB_TIMING;
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
it.skipIf(!enabled)('times the owned Fibonacci presentation paint (placement, render, drag)',{timeout:600000},async()=>{
 const f=await fibBaselineHarness();try{
  const init={id:'SYNTHETIC timing',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true}}};
  const row=createDrawing('fibretracement',init)!.serialize();const levels=(row.props as {levels:unknown[]}).levels.length;
  const draft=createDrawing('fibretracement',{...init,id:'SYNTHETIC timing draft',anchors:[init.anchors[0]]})!;
  const rounds=Number(process.env.LV_FIB_TIMING_ROUNDS??5),placing:number[]=[],render:number[]=[],move:number[]=[];
  for(let i=0;i<rounds;i++){f.interaction.state={kind:'placing',draft,need:2,cursor:{time:1240000,price:200-i}};const t=performance.now();f.render();placing.push(performance.now()-t);}
  f.interaction.state={kind:'idle'};f.sync([row]);
  for(let i=0;i<rounds;i++){const t=performance.now();f.render();render.push(performance.now()-t);}
  f.interaction.down(300,150,'off',false,false);
  for(let i=1;i<=rounds;i++){const t=performance.now();f.interaction.move(300+i*4,150+i*2);move.push(performance.now()-t);}
  expect(f.interaction.state.moved).toBe(true);expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  process.stderr.write(`FIB-TIMING levels=${levels} rounds=${rounds} placing_median_ms=${median(placing).toFixed(1)} render_median_ms=${median(render).toFixed(1)} move_median_ms=${median(move).toFixed(1)}\n`);
 }finally{f.cleanup();}
});
