import {expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {AUTO_ELLIOTT_DEFINITION,countElliottWaves,elliottSwings} from '../../src/domain/indicators-ext/auto-elliott-waves';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {catalogDefinition} from '../../src/domain/indicator-catalog';

// SYNTHETIC bars: straight 12-bar legs between waypoints, +/-0.5 range around the close.
function legs(points:readonly number[]):Bar[]{
 const bars:Bar[]=[];let t=1;
 for(let k=0;k<points.length-1;k++)for(let i=0;i<12;i++){const c=points[k]+(points[k+1]-points[k])*i/12;bars.push({time:t++*60,open:c,high:c+.5,low:c-.5,close:c,volume:1});}
 const c=points[points.length-1];bars.push({time:t*60,open:c,high:c+.5,low:c-.5,close:c,volume:1});
 return bars;
}
const UP=[100,110,100,120,110,140,130,150,135,145,125,145,150];// 0-1-2-3-4-5 then A-B-C, then a tail that confirms C
it('labels an up impulse 1-5 and the A-B-C correction on confirmed swings, with up and down legs',()=>{
 const waves=countElliottWaves(elliottSwings(legs(UP),'Small'),true);
 expect(waves.map(w=>w.label).join('')).toBe('12345ABC');
 expect(waves.map(w=>w.up)).toEqual([true,false,true,false,true,false,true,false]);
 expect(waves.filter(w=>w.kind==='corrective')).toHaveLength(3);
});
it('mirrors for a down impulse and hides the correction when asked',()=>{
 const down=UP.map(p=>260-p),swings=elliottSwings(legs(down),'Small');
 expect(countElliottWaves(swings,true).map(w=>w.label).join('')).toBe('12345ABC');
 expect(countElliottWaves(swings,false).map(w=>w.label).join('')).toBe('12345');
 expect(countElliottWaves(swings,true)[0].up).toBe(false);
});
it('rejects a count that breaks the rules: wave 4 overlapping wave 1, or wave 3 the shortest', ()=>{
 expect(countElliottWaves(elliottSwings(legs([100,110,100,120,110,140,115,150,140]),'Small'),true)).toEqual([]);
 expect(countElliottWaves(elliottSwings(legs([100,110,100,140,125,150,135,175,160]),'Small'),true)).toEqual([]);
});
it('is visual-only: no values, marks published, alerts refused, deterministic', ()=>{
 const definition=catalogDefinition('autoelliott')!;expect(definition).toBe(AUTO_ELLIOTT_DEFINITION);
 const bars=legs(UP);let published:any;
 const ctx:any={bars,str:(k:string)=>k==='swingSize'?'Small':'',bool:()=>true,num:()=>0,marks:(m:unknown)=>{published=m;}};
 const out=definition.calculate(ctx) as any;
 expect(out.bullish.every((v:unknown)=>v===null)&&out.bearish.every((v:unknown)=>v===null)).toBe(true);
 expect(published.markers.map((m:any)=>m.text).join('')).toBe('12345ABC');expect(published.lines).toHaveLength(8);
 expect(indicatorAlertBlock('autoelliott',{})).toMatch(/chart-only visual study/);
 expect(countElliottWaves(elliottSwings(bars,'Small'),true)).toEqual(countElliottWaves(elliottSwings(bars,'Small'),true));
});

// Wave labels sit outside price action, peaks above and troughs below.
it('puts each wave label above a peak and below a trough',()=>{
 const bars=legs(UP);let published:any;
 AUTO_ELLIOTT_DEFINITION.calculate({bars,str:(k:string)=>k==='swingSize'?'Small':'',bool:()=>true,num:()=>0,marks:(m:unknown)=>{published=m;}} as any);
 expect(published.markers.length).toBe(8);
 // 1, 3, 5, B end on peaks; 2, 4, A, C on troughs.
 expect(published.markers.map((m:any)=>m.text+':'+m.position).join(' ')).toBe('1:above 2:below 3:above 4:below 5:above A:below B:above C:below');
 for(const m of published.markers){const bar=bars[m.index];expect(m.position==='above'?bar.high>=bars[m.index-1].high:bar.low<=bars[m.index-1].low).toBe(true);}
});
