// OpenCandle 0.8.2: the harmonic patterns (XABCD, Cypher, ABCD, Three drives) start above the price series, so their legs,
// fills and leg ratio labels are not painted under the candles. Vela places a new drawing by its type's coversSeries
// (startZ: above the series stack instead of just under the price series).
import {describe,expect,it} from 'vitest';
import {createDrawing,getDrawingType} from '@luxalgo/vela';
import {SERIES_COVER_TYPES} from '../../../src/chart/lv-drawing-types';
import {SERIES_COVER_PATTERN_TYPES} from '../../../src/chart/drawing-fixes/series-cover';

describe('harmonic patterns paint above the price series',()=>{
 it('XABCD, Cypher, ABCD and Three drives declare coversSeries and keep their factory, defaults and label',()=>{
  expect([...SERIES_COVER_TYPES].sort()).toEqual(['abcd','cypher','lvthreedrives','xabcd']);
  for(const type of SERIES_COVER_PATTERN_TYPES){
   const meta=getDrawingType(type as never);expect(meta?.coversSeries,type).toBe(true);
   const model=createDrawing(type as never,{id:'synthetic-'+type,paneId:'price',createdAt:0} as never);expect(model?.type).toBe(type);
   expect(meta?.defaultStyle).toBeTruthy();expect(meta?.label).toBeTruthy();
  }
  // The XABCD factory default (line width 2) and the drawing blue contrast default survive the re-registration.
  expect((getDrawingType('xabcd' as never)?.defaultStyle as {lineWidth?:number}).lineWidth).toBe(2);
  expect(String((getDrawingType('cypher' as never)?.defaultStyle as {lineColor?:string}).lineColor).toLowerCase()).not.toContain('38c0fd');
 });
 it('other patterns and line tools keep the default placement under the price series',()=>{
  for(const type of ['headshoulders','trendline','elliottimpulse'])expect(getDrawingType(type as never)?.coversSeries,type).toBeFalsy();
 });
});
