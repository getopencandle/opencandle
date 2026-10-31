import {afterEach,it,expect} from 'vitest';
import {captureChartCsvColumns} from '../../src/chart/chart-csv-capture';
import {chartSourceCsv} from '../../src/ui/chart-source-export';
import {csvRows} from '../../src/domain/data';
import {csvModelFixture} from '../fixtures/r42-csv-model';
const fixtures:Array<ReturnType<typeof csvModelFixture>>=[];afterEach(()=>{for(const value of fixtures.splice(0))value.dispose();});
const fixture=()=>{const value=csvModelFixture();fixtures.push(value);return value;};
const capture=(f:ReturnType<typeof fixture>,assert=()=>{})=>captureChartCsvColumns(f.chart,f.input,'ordinary',f.inventory(),assert);

it('captures literal accepted offset/presentation points, not raw domain or latest readout values',()=>{
 const f=fixture(),series=f.line('SMA',[null,12,13],[160,400,640]);f.add(0,'Ignored internal title',[series]);
 const result=capture(f),rows=csvRows(chartSourceCsv(f.input,'ordinary',result.columns,result.assertCurrent));
 expect(rows[0].at(-1)).toBe('Simple Moving Average: SMA');expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['','','12']);expect(result.columns[0].points.at(-1)).toEqual({time:640,value:13});
});
it('captures sparse literal comparison units as rendered, without reading source close as plotted percent',()=>{
 const f=fixture();f.add(1,'SPY',[f.line('SPY rendered percent',[0,25],[100,400])]);const result=capture(f),rows=csvRows(chartSourceCsv(f.input,'ordinary',result.columns));
 expect(rows[0].at(-1)).toBe('Compare SPY (percent): Close');expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['0','','25']);
});
it('exports retained script numeric plots even when pane display is disabled, with human duplicate numbering',()=>{
 const f=fixture();f.add(2,'Synthetic strategy',[f.line('Synthetic strategy · Equity',[100,110,105])]);f.add(2,'Synthetic strategy',[f.line('Synthetic strategy · Equity',[200,null,240])]);
 const result=capture(f);expect(result.columns.map(row=>row.label)).toEqual(['Synthetic strategy: Equity','Synthetic strategy: Equity (2)']);expect(result.columns.map(row=>row.label).join(' ')).not.toMatch(/synthetic-instance|synthetic-renderer/);
});
it('exports actual candle-valued study fields and unavailable volume independently',()=>{
 const f=fixture();f.add(2,'Synthetic delta',[{id:'synthetic-candle',title:'Delta',paneId:'price',kind:'candle',bars:[{time:100000,open:-2,high:5,low:-4,close:3,volume:NaN},{time:400000,open:3,high:9,low:1,close:7,volume:8}]}]);
 const columns=capture(f).columns,rows=csvRows(chartSourceCsv(f.input,'ordinary',columns));expect(columns.map(row=>row.label)).toEqual(['Synthetic delta: Delta open','Synthetic delta: Delta high','Synthetic delta: Delta low','Synthetic delta: Delta close','Synthetic delta: Delta volume']);expect(rows.slice(1).map(row=>row.slice(20))).toEqual([['-2','5','-4','3',''],['','','','',''],['3','9','1','7','8']]);
});
it('retains whole-hidden numerical models only while their accepted input and output are current',()=>{
 const f=fixture(),value=f.add(0,'SMA',[f.line('SMA',[null,12,13])]);value.record.hidden=true;f.models.delete(value.rendererId);expect(capture(f).columns[0].points[2].value).toBe(13);
 value.instance.displayInput=[];expect(()=>capture(f)).toThrow('changed');
});
it('has an explicit source-only compatibility path for an empty configured graph, not for missing expected studies',()=>{
 let owned=0;const f=fixture(),reduced={} as typeof f.chart;expect(captureChartCsvColumns(reduced,f.input,'ordinary',{indicators:[],scripts:[],comparisons:[]},()=>{owned++;}).columns).toEqual([]);expect(owned).toBe(1);
 expect(()=>captureChartCsvColumns(reduced,f.input,'ordinary',{indicators:['expected'],scripts:[],comparisons:[]},()=>{})).toThrow();
});
