import {expect,it} from 'vitest';
import {rendererLayers} from '@luxalgo/vela';
import {registerTemporalChartTypes} from '../../src/chart/chart-types';
import {settingsDefaults} from '../../src/chart/chart-settings';
import {painterFixture,withHexColorProbe} from './chart-paint-harness';

it('PAINT.REVIEW.HIGHLOW.INVERT labels stay with their actual high/low endpoints',async()=>{const f=await painterFixture();registerTemporalChartTypes();const layer=rendererLayers().find(row=>row.id==='highlow')!.create();layer.mount(f.recording.canvas);f.native.scene.bars=[{time:1,open:10,high:12,low:8,close:11,volume:1}];layer.render(f.layerArgs('highlow',settingsDefaults('highlow'),{coords:{...f.coords,pxPerBar:()=>40,priceToY:(p:number)=>p} as any}));const labels=f.recording.commands.filter(row=>row.op==='fillText');expect(labels.map(row=>row.values)).toEqual([['12',50,23],['8',50,4]]);layer.destroy?.();});

it('PAINT.REVIEW.CHIP.SOURCE actual native chrome matches the chosen source and type color',async()=>{const f=await painterFixture();f.native.scene.priceStyle='line';f.renderer.applyConfig({layout:{background:'#131722'},line:{color:'#22ab94'},candles:{upColor:'#22ab94',downColor:'#f7525f'},chartTypes:{line:{source:'open',color:'#123456'}}});const before=structuredClone(f.native.scene.bars);withHexColorProbe(()=>f.native.chrome.drawPriceLineAndCountdown(f.recording.ctx,f.native.scene,f.coords,f.native.theme,300,f.pane));const text=f.recording.commands.find(row=>row.op==='fillText')!;expect(Number(text.values[0])).toBe(10);expect(text.values.at(-1)).toBe(90);expect(f.recording.commands.find(row=>row.op==='fillRect')?.color).toBe('#123456');expect(f.native.scene.bars).toEqual(before);});

it('PAINT.REVIEW.CANDLE.AGGREGATE all hidden components stay hidden below one pixel spacing',async()=>{const f=await painterFixture();Object.assign(f.native.scene.style.candle,{bodyVisible:false,borderVisible:false,wickVisible:false});f.backend.drawCandles(f.recording.ctx,f.native.scene,f.native.scene.bars,0,0,{...f.coords,bodySpacing:()=>.5},f.pane,f.native.theme,new Map());expect(f.recording.commands.filter(row=>['stroke','fillRect','strokeRect'].includes(row.op))).toEqual([]);});
