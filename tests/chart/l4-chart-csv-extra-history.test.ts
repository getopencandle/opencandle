import {afterEach,expect,it} from 'vitest';
import {captureChartCsvColumns,CHART_CSV_OMITTED_SUFFIX} from '../../src/chart/chart-csv-capture';
import {chartSourceCsv} from '../../src/ui/chart-source-export';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {csvModelFixture} from '../fixtures/r42-csv-model';

// A chart with an extra-history study still exports its source bars and every other
// study; the extra-history values (and anything reading them through Source) are withheld as an empty labelled column.
const fixtures:Array<ReturnType<typeof csvModelFixture>>=[];afterEach(()=>{for(const value of fixtures.splice(0))value.dispose();});
const fixture=()=>{const value=csvModelFixture();fixtures.push(value);return value;};
const capture=(f:ReturnType<typeof fixture>)=>captureChartCsvColumns(f.chart,f.input,'ordinary',f.inventory(),()=>{});

it('exports the other studies next to a withheld 52-week high/low column instead of failing',()=>{
 const f=fixture();f.add(0,'SMA',[f.line('SMA',[null,12,13])]);f.add(0,'52 week',[f.line('High',[7001,7002,7003])],{kind:'w52hl'});
 const result=capture(f),text=chartSourceCsv(f.input,'ordinary',result.columns,result.assertCurrent),name=catalogDefinition('w52hl')!.name;
 expect(result.columns.map(row=>row.label)).toEqual(['Simple Moving Average: SMA',name+CHART_CSV_OMITTED_SUFFIX]);
 expect(result.omitted).toEqual([name]);expect(text).not.toMatch(/700[123]/);expect(text.split('\r\n')[0]).toContain(name+CHART_CSV_OMITTED_SUFFIX);
 expect(text.split('\r\n')[3]).toMatch(/,13,$/);
});
it('withholds a study that reads an extra-history study through its Source input',()=>{
 const f=fixture(),history=f.add(0,'Volume profile',[f.line('POC',[5001,5002,5003])],{kind:'vrvp'});
 f.add(0,'SMA of POC',[f.line('SMA',[null,6001,6002])],{inputs:{length:2,source:encodeIndicatorSource(history.id,'poc')}});
 const result=capture(f);expect(result.columns.every(row=>row.points.length===0)).toBe(true);expect(result.omitted).toEqual([catalogDefinition('vrvp')!.name,'Simple Moving Average']);
 expect(chartSourceCsv(f.input,'ordinary',result.columns,result.assertCurrent)).not.toMatch(/[56]00[123]/);
});
it('keeps the replacement guard on a withheld study',()=>{
 const f=fixture(),value=f.add(0,'52 week',[f.line('High',[1,2,3])],{kind:'w52hl'}),result=capture(f);value.record.renderHandle={id:'replaced'};expect(result.assertCurrent).toThrow('changed');
});
it('reports no omissions for an ordinary chart',()=>{const f=fixture();f.add(0,'SMA',[f.line('SMA',[null,12,13])]);expect(capture(f).omitted).toBeUndefined();});
