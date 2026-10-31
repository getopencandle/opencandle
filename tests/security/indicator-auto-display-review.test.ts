import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from '../chart/indicator-display-harness';
import {installIndicatorDisplay} from '../../src/chart/indicator-display';

it('copied or getter-bearing port-shaped data cannot acquire private display authority',async()=>{
 const t=await indicatorDisplayHarness(false);try{let reads=0;const counterfeit={get list(){reads++;return t.port.list;}};
 expect(()=>installIndicatorDisplay(t.renderer,t.chart,{...t.port})).toThrow(/exact|port/);expect(()=>installIndicatorDisplay(t.renderer,t.chart,counterfeit)).toThrow(/exact|port/);expect(reads).toBe(0);
 }finally{t.dispose();}
});

it('missing accepted native scene ownership withholds labels with an explicit diagnostic',async()=>{
 const t=await indicatorDisplayHarness();try{const id=t.port.add('sma',{length:1}),rendererId=t.port.list().find(row=>row.id===id)!.rendererId;t.native.scene.indicators.delete(rendererId);
 expect(t.paint()).toEqual([]);expect(t.display.diagnostics().some(row=>/model|scene|missing|accepted/i.test(row.message))).toBe(true);
 }finally{t.dispose();}
});

it('an old retained wrapper cannot paint after disposal and replacement installation',async()=>{
 const t=await indicatorDisplayHarness();try{t.port.add('sma',{length:1});const old=t.native.chrome.drawMergedScaleColumns;t.display.dispose();t.install();t.recording.commands.length=0;
 expect(()=>Reflect.apply(old,t.native.chrome,[t.recording.ctx,t.native.scene,t.coords,t.coords.width])).toThrow(/retired|changed/);expect(t.recording.commands).toEqual([]);expect(t.paint()).toHaveLength(1);
 }finally{t.dispose();}
});

it('formatter disposal during candidate preparation cannot paint into a retired owner',async()=>{
 const t=await indicatorDisplayHarness(false);try{t.port.add('sma',{length:1});const original=t.native.dataWindowFmt;
 t.native.dataWindowFmt=function(this:any,...args:any[]){t.display.dispose();return Reflect.apply(original,this,args);};t.install();
 expect(t.paint()).toEqual([]);
 }finally{t.dispose();}
});

it('source-prefix replacement inside coordinate resolution cannot publish a stale endpoint label',async()=>{
 const t=await indicatorDisplayHarness();try{t.port.add('sma',{length:1});const original=t.coords.priceToY;let changed=false;
 t.coords.priceToY=(...args:Parameters<typeof original>)=>{if(!changed){changed=true;t.core.bars=t.core.bars.map((bar:any)=>({...bar,close:900}));}return original(...args);};
 expect(t.paint()).toEqual([]);expect(t.display.diagnostics().some(row=>/prefix|source|accepted|changed/i.test(row.message))).toBe(true);
 }finally{t.dispose();}
});

it('option repaint callbacks cannot recursively accept a conflicting option transaction',async()=>{
 const t=await indicatorDisplayHarness(false);try{t.port.add('sma',{length:1});let nested=false,nestedFailure:unknown;
 t.native.scheduler.invalidate=()=>{if(!nested){nested=true;try{t.display.setOptions({labelsVisible:true,valuesVisible:false});}catch(error){nestedFailure=error;}}};t.install();
 t.display.setOptions({labelsVisible:false,valuesVisible:false});expect(String(nestedFailure)).toMatch(/active|progress|reentrant|busy/i);expect(t.paint()).toEqual([]);
 }finally{t.dispose();}
});

it('a throwing formatter withholds labels, restores canvas state and clears diagnostics on a later valid frame',async()=>{
 const t=await indicatorDisplayHarness(false);try{t.port.add('sma',{length:1});const original=t.native.dataWindowFmt;let broken=true;
 t.native.dataWindowFmt=function(this:any,...args:any[]){if(broken)throw Error('independent format fault');return Reflect.apply(original,this,args);};t.install();
 const state=()=>({font:t.recording.ctx.font,alpha:t.recording.ctx.globalAlpha,align:t.recording.ctx.textAlign});const initial=state();expect(t.paint()).toEqual([]);expect(state()).toEqual(initial);expect(t.display.diagnostics()[0].message).toContain('independent format fault');broken=false;expect(t.paint()).toHaveLength(1);expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});
