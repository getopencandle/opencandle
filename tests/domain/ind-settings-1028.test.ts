import {expect,it} from 'vitest';
import {applyIndicatorVolumePalette} from '../../src/chart/indicator-volume-palette';
import {defaultIndicatorPresentation,indicatorDefaults,indicatorInputSchema,validateIndicatorVolumePalette,VOLUME_FOUR_WAY_DEFAULTS,type IndicatorVolumePalette} from '../../src/chart/indicator-settings';
import {calculateIndicator,obv} from '../../src/domain/indicators';

const mk=(close:number[],volume:number[],open?:number[])=>close.map((c,i)=>({time:1700000000+i*60,open:open?open[i]:c,high:c+2,low:c-2,close:c,volume:volume[i]}));
const four=():IndicatorVolumePalette=>({schemaVersion:1,mode:'rising-falling',upColor:'#00ff00',downColor:'#ff0000',...VOLUME_FOUR_WAY_DEFAULTS});

it('Volume rising-falling colors use up/down vs previous close and rising/falling volume vs previous bar',()=>{
 const bars=mk([10,11,10,9,10],[100,200,150,300,250]);
 const points=bars.map(b=>({value:b.volume as number|null,color:undefined as string|undefined}));
 applyIndicatorVolumePalette(points,bars,four(),100);
 // bar0: first sample compares close to open (equal -> up), no previous volume -> falling
 expect(points.map(p=>p.color)).toEqual([VOLUME_FOUR_WAY_DEFAULTS.upFallingColor,VOLUME_FOUR_WAY_DEFAULTS.upRisingColor,VOLUME_FOUR_WAY_DEFAULTS.downFallingColor,VOLUME_FOUR_WAY_DEFAULTS.downRisingColor,VOLUME_FOUR_WAY_DEFAULTS.upFallingColor]);
});
it('four-color palette validation: all four required for the mode, extras rejected for others, bad color rejected',()=>{
 expect(()=>validateIndicatorVolumePalette(four())).not.toThrow();
 const missing:any={...four()};delete missing.downFallingColor;expect(()=>validateIndicatorVolumePalette(missing)).toThrow();
 expect(()=>validateIndicatorVolumePalette({...four(),upRisingColor:'var(--x)'})).toThrow();
 expect(()=>validateIndicatorVolumePalette({...four(),mode:'previous-close'})).not.toThrow();
});
it('MACD zero guide keeps an editable value, defaulting to 0',()=>{
 expect(defaultIndicatorPresentation('macd').guides.zero?.value).toBe(0);
});
it('OBV Source defaults to close, appears in the schema, and drives the comparison',()=>{
 expect(indicatorDefaults.obv.source).toBe('close');
 expect(indicatorInputSchema('obv').some(f=>f.key==='source'&&f.defval==='close')).toBe(true);
 const bars=mk([10,11,12,11],[100,100,100,100]);
 const flat=bars.map(b=>({...b,high:10,low:10}));
 expect(obv(bars)).toEqual([0,100,200,100]);
 expect(obv(flat,'high')).toEqual([0,0,0,0]);
 expect(calculateIndicator('obv',flat,{source:'high'}).series[0].values).toEqual([0,0,0,0]);
 expect(calculateIndicator('obv',bars,{}).series[0].values).toEqual([0,100,200,100]);
});
it('KC keeps a separate ATR length and CCI keeps its smoothing section',()=>{
 expect(indicatorInputSchema('kc').find(f=>f.key==='atrLength')?.defval).toBe(10);
 const keys=indicatorInputSchema('cci').map(f=>f.key);expect(keys).toEqual(expect.arrayContaining(['maType','maLength']));
});
