// Fail-first tests for defects found in the review. SYNTHETIC bars only.
import {describe,expect,it} from 'vitest';
import type {LineLikeSeries} from '@luxalgo/vela';
import {calculateIndicator} from '../../src/domain/indicators';
import {renderIndicatorPresentation,SEGMENT_BREAK_COLOR} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

// Three New York sessions of SYNTHETIC flat 1-minute regular-hours bars (09:30-10:29 ET each day, EDT = UTC-4).
const flat:Bar[]=[1,2,3].flatMap(day=>Array.from({length:60},(_,i)=>({time:Date.UTC(2026,8,day,13,30+i)/1000,open:100,high:100.5,low:99.5,close:100,volume:100})));
const settings=(id:string,period:string):IndicatorInstanceSettings=>({id,kind:'pvp',inputs:{...indicatorDefaults.pvp,developingPoc:true,period},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('pvp')} as IndicatorInstanceSettings);
const context={resolution:'1m',calendar:'us-equity'} as const;
const colorsOf=(id:string,period:string)=>{
 const s=settings(id,period),result=calculateIndicator('pvp',flat,s.inputs,{resolution:'1m',calendar:'us-equity'});
 expect(result.diagnostics).toEqual([]);
 const series=renderIndicatorPresentation(s,result,flat,context).output.series as LineLikeSeries[];
 const dev=series.find(row=>row.title==='Developing POC')!;
 return {values:dev.points.map(point=>point.value),colors:dev.points.map(point=>(point as {color?:string}).color??null)};
};

describe(' F1: reused plot points must not carry colors a previous presentation wrote in place',()=>{
 it('a Period change Day to Week on unchanged developing values renders exactly as a fresh instance does',()=>{
  const day=colorsOf('pvp-instance','Day');
  expect(day.colors.filter(color=>color===SEGMENT_BREAK_COLOR).length).toBe(2);// each new day breaks the developing line
  const week=colorsOf('pvp-instance','Week'),fresh=colorsOf('pvp-fresh-instance','Week');
  expect(week.values).toEqual(day.values);// the developing values are identical, so every point is a reuse candidate
  expect(fresh.colors.filter(color=>color===SEGMENT_BREAK_COLOR).length).toBe(0);// one weekly profile: no break
  expect(week.colors).toEqual(fresh.colors);// The two day-start points keep the transparent stroke (gaps)
 });
});
