import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';

// Placement previews paint through the native ghost body. Committed drawings are
// clipped to their pane by the native paintClipped scope; the preview must use
// the same scope so extension levels never cover indicator panes below it.
async function placingFixture(){
 const f=await fibBaselineHarness();
 f.pane.bounds={top:0,height:150};
 const rsi={id:'rsi',bounds:{top:150,height:150},scale:{min:0,max:100,log:false,invert:false},collapsed:false};
 f.renderer.scene.panes.set('rsi',rsi);f.renderer.scene.orderedPanes=()=>[f.pane,rsi];
 const row=fibBaselineRecord();
 // Extension level 2.618 reaches far below the price pane.
 (row.props!.levels as any[]).push({ratio:2.618,color:'#fedcba',enabled:true});
 row.anchors=[{time:1000000,price:250},{time:1240000,price:200}];
 const draft=createDrawing('fibretracement',{...row,anchors:[row.anchors[0]]})!;
 f.interaction.state={kind:'placing',draft,need:2,cursor:row.anchors[1]};
 return f;
}

it('clips the Fibonacci placement preview to the pane it is placed in',async()=>{
 const f=await placingFixture();
 try{
  f.top.commands.length=0;f.render();
  const commands=f.top.commands,strokes=commands.map((c,i)=>c.op==='stroke'?i:-1).filter(i=>i>=0);
  expect(strokes.length).toBeGreaterThan(0);
  const clip=commands.findIndex(c=>c.op==='clip'),rect=commands.findIndex(c=>c.op==='rect'&&JSON.stringify(c.values)===JSON.stringify([0,0,400,150]));
  expect(rect).toBeGreaterThanOrEqual(0);expect(clip).toBeGreaterThan(rect);
  expect(clip).toBeLessThan(strokes[0]);
  // The extension level itself is still emitted (inside the clip), so the
  // visible preview is unchanged within the price pane.
  expect(commands.some(c=>c.op==='stroke'&&c.color==='#fedcba')).toBe(true);
  expect(f.baseline.diagnostics()).toEqual([]);expect(f.annotation.diagnostics()).toEqual([]);
  // The scope closes: canvas state after the frame matches the starting state.
  expect(f.top.ctx.globalAlpha).toBe(1);
 }finally{f.cleanup();}
});

it('paints no preview when its pane is collapsed, like a committed drawing',async()=>{
 const f=await placingFixture();
 try{
  f.pane.collapsed=true;f.top.commands.length=0;f.render();
  // The placed-anchor marker (native placingMarkers handle: arc/fill/stroke) is chrome, not the preview body.
  expect(f.top.commands.filter(c=>['lineTo','fillText','fillRect'].includes(c.op))).toEqual([]);
  expect(f.top.commands.some(c=>c.op==='arc')).toBe(true);
 }finally{f.cleanup();}
});
