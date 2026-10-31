import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';

async function privateColumn(){const t=await indicatorDisplayHarness();const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId);model.ownScale=true;t.native.scene.indicatorScales.set(model.id,{scale:{min:0,max:40},scaleTarget:{min:0,max:40}});return{...t,model,id};}

it('actual tick-coordinate source retirement emits no obsolete private tick or label and restores canvas state',async()=>{
 const t=await privateColumn();try{const original=t.coords.priceToY;let retired=false;t.coords.priceToY=(...args:Parameters<typeof original>)=>{if(!retired){retired=true;t.core.bars=[...t.core.bars];}return original(...args);};const state={font:t.recording.ctx.font,align:t.recording.ctx.textAlign,alpha:t.recording.ctx.globalAlpha};
  t.paint();expect(t.recording.commands.filter(row=>row.op==='fillText')).toEqual([]);expect(t.display.diagnostics().some(row=>/prefix|owner|source/.test(row.message))).toBe(true);expect({font:t.recording.ctx.font,align:t.recording.ctx.textAlign,alpha:t.recording.ctx.globalAlpha}).toEqual(state);
 }finally{t.dispose();}
});

it('retirement during actual native readout formatting withholds every stale row',async()=>{
 const t=await indicatorDisplayHarness(false);try{const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),format=t.native.dataWindowFmt;t.native.dataWindowFmt=function(this:any,...args:any[]){t.display.dispose();return Reflect.apply(format,this,args);};t.install();expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual([]);
 }finally{t.dispose();}
});

it('recursive painter attempts cannot borrow a live call-local tick price or corrupt its outer format',async()=>{
 const t=await privateColumn();try{const original=t.coords.priceToY;let attempted=false,problem:unknown;t.coords.priceToY=(...args:Parameters<typeof original>)=>{if(!attempted){attempted=true;try{t.native.chrome.drawMergedScaleColumns(t.recording.ctx,t.native.scene,t.coords,300);}catch(error){problem=error;}}return original(...args);};
  t.paint();expect(String(problem)).toMatch(/progress/);expect(t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369).map(row=>row.values[0])).toEqual(['10.0000','20.0000','30.0000']);
 }finally{t.dispose();}
});

it('failed actual native precision update restores the accepted model, settings and precision tuple',async()=>{
 const t=await indicatorDisplayHarness();try{const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const accepted=t.port.serialize(),mount=t.renderer.mountIndicator.bind(t.renderer);let fail=true;
  t.renderer.mountIndicator=model=>{const result=mount(model);if(fail){fail=false;throw Error('literal precision mount failure');}return result;};expect(()=>t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:1}})).toThrow();expect(t.port.serialize()).toEqual(accepted);expect(t.paint().map(row=>row.values[0])).toEqual(['20.0000']);const model=t.native.scene.indicators.get(t.port.list()[0].rendererId);expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')[0].value).toBe('20.0000');
 }finally{t.dispose();}
});

it('a late source change inside native formatter cannot return old raw-point precision text',async()=>{
 const t=await indicatorDisplayHarness(false);try{const id=t.port.add('sma',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('sma'),precision:4}});const format=t.native.dataWindowFmt;t.native.dataWindowFmt=function(this:any,...args:any[]){t.core.bars=[...t.core.bars];return Reflect.apply(format,this,args);};t.install();const model=t.native.scene.indicators.get(t.port.list()[0].rendererId);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')).toEqual([]);expect(t.display.diagnostics()[0].message).toMatch(/prefix|source/);
 }finally{t.dispose();}
});
