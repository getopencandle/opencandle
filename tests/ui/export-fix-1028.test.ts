import {afterEach,expect,it} from 'vitest';
import {captureChartCsvColumns} from '../../src/chart/chart-csv-capture';
import {symbolEntryBlocked} from '../../src/ui/symbol-search';
import {snapshotFileName,snapshotMenuRows,snapshotTicker} from '../../src/ui/top-toolbar-model';
import {csvModelFixture} from '../fixtures/r42-csv-model';

const fixtures:Array<ReturnType<typeof csvModelFixture>>=[];afterEach(()=>{for(const value of fixtures.splice(0))value.dispose();});
const fixture=()=>{const value=csvModelFixture();fixtures.push(value);return value;};
const capture=(f:ReturnType<typeof fixture>)=>captureChartCsvColumns(f.chart,f.input,'ordinary',f.inventory(),()=>{});

it('row 2: RSI zone/fill anchors (untitled, off the data window) are left out of the CSV instead of failing',()=>{
 const f=fixture(),anchor=(values:number[])=>({...f.line('',values),display:{pane:true,priceScale:false,legend:false,dataWindow:false}});
 f.add(0,'RSI',[f.line('RSI',[null,55,60]),f.line('RSI-based MA',[null,null,57]),anchor([30,30,30]),anchor([70,70,70])],{kind:'rsi'});
 const result=capture(f);
 expect(result.columns.map(row=>row.label)).toEqual(['Relative Strength Index: RSI','Relative Strength Index: RSI-based MA']);
 expect(result.assertCurrent).not.toThrow();
});
it('row 2: an untitled plot that is on the data window exports as "Plot" with distinct headers',()=>{
 const f=fixture();f.add(0,'SMA',[f.line('',[1,2,3]),f.line(' ',[4,5,6])]);
 expect(capture(f).columns.map(row=>row.label)).toEqual(['Simple Moving Average: Plot','Simple Moving Average: Plot (2)']);
});
it('row 3: an open native or aria-modal dialog blocks typed symbol entry',()=>{
 const root=(open:string)=>({querySelector:(selector:string)=>selector.split(',').includes(open)?{}:null});
 for(const open of ['dialog[open]','[aria-modal="true"]','[role=dialog]'])expect(symbolEntryBlocked(root(open),null),open).toBe(true);
});
it('row 8: snapshot menu rows and reference-style file name with the plain ticker',()=>{
 expect(snapshotMenuRows({hasChart:true}).map(row=>[row.id,row.label,row.enabled])).toEqual([['download-image','Download image',true],['copy-image','Copy image',true]]);
 const busy=snapshotMenuRows({hasChart:true,busy:true});expect(busy[0].enabled).toBe(false);expect(busy[1].enabled).toBe(true);
 expect(snapshotMenuRows({hasChart:false}).every(row=>!row.enabled&&row.reason)).toBe(true);
 expect(snapshotTicker('SYNTHETIC:GME')).toBe('GME');expect(snapshotTicker('NASDAQ:BRK.B')).toBe('BRK.B');expect(snapshotTicker('::')).toBe('Chart');
 const name=snapshotFileName('SYNTHETIC:GME',new Date(2026,9,27,9,5,7));
 expect(name).toBe('GME_2026-10-27_09-05-07.png');expect(name).toMatch(/^[A-Za-z0-9 _.-]{1,100}$/);
});
