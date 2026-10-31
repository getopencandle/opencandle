import {expect,it} from 'vitest';
import {installAppearancePainters,latestPricePresentation} from '../../src/chart/appearance-painters';
import {painterFixture,withHexColorProbe} from '../chart/chart-paint-harness';

it('failed second wrapper acquisition removes the first wrapper without changing upstream methods',async()=>{
 const f=await painterFixture(false),chrome=f.native.chrome,chip=chrome.drawPriceLineAndCountdown,candles=f.backend.drawCandles;Object.preventExtensions(f.backend);
 expect(()=>installAppearancePainters(f.renderer)).toThrow();expect(Object.hasOwn(chrome,'drawPriceLineAndCountdown')).toBe(false);expect(chrome.drawPriceLineAndCountdown).toBe(chip);expect(f.backend.drawCandles).toBe(candles);
});
it('teardown preserves another owner, releases the remaining wrapper and retires retained calls',async()=>{
 const f=await painterFixture(),chrome=f.native.chrome,retained=f.backend.drawCandles,replacement=()=>{};chrome.drawPriceLineAndCountdown=replacement;
 expect(()=>f.dispose()).toThrow(AggregateError);expect(chrome.drawPriceLineAndCountdown).toBe(replacement);expect(Object.hasOwn(f.backend,'drawCandles')).toBe(false);
 expect(()=>retained.call(f.backend,f.recording.ctx,f.native.scene,f.native.scene.bars,0,0,f.coords,f.pane,f.native.theme,new Map())).toThrow(/retired/i);expect(()=>f.dispose()).not.toThrow();
});
it('rejects an old backend wrapper after the renderer replaces that backend',async()=>{
 const f=await painterFixture();try{f.native.backend={kind:'canvas2d'};expect(()=>f.backend.drawCandles(f.recording.ctx,f.native.scene,f.native.scene.bars,0,0,{...f.coords,bodySpacing:()=>.5},f.pane,f.native.theme,new Map())).toThrow(/owner|changed|retired/i);expect(f.recording.commands).toEqual([]);}finally{f.dispose();}
});
it('rejects an old chrome wrapper after the renderer replaces its chrome owner',async()=>{
 const f=await painterFixture(),chrome=f.native.chrome;try{f.native.chrome={};expect(()=>withHexColorProbe(()=>chrome.drawPriceLineAndCountdown(f.recording.ctx,f.native.scene,f.coords,f.native.theme,300,f.pane))).toThrow(/owner|changed|retired/i);expect(f.recording.commands).toEqual([]);}finally{f.dispose();}
});
it('selected-source presentation leaves the full native history and model identities unchanged',async()=>{
 const f=await painterFixture(false);f.native.scene.priceStyle='line';f.native.scene.style.chartTypes={line:{source:'open',color:'rebeccapurple'}};const bars=f.native.scene.bars,bar=bars[0],before=structuredClone(bars),models=f.native.scene.indicators;
 expect(latestPricePresentation(f.native.scene,f.coords,f.native.theme,f.pane)).toEqual({value:10,color:'rebeccapurple'});expect(f.native.scene.bars).toBe(bars);expect(f.native.scene.bars[0]).toBe(bar);expect(f.native.scene.bars).toEqual(before);expect(f.native.scene.indicators).toBe(models);
});
