import {describe,expect,it} from 'vitest';
import {inflateRawSync} from 'node:zlib';
import {INDICATOR_KINDS,indicatorCreationInputs} from '../../src/chart/indicator-settings';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {evaluateDomainIndicator} from '../../src/chart/indicator-port';
import {demoDailyDataset} from '../../src/domain/fixtures';
import {crc32} from '../../src/domain/xlsx-zip';
import {chartMenuEntries} from '../../src/ui/ChartContextMenu';
import type {ChartContextActions,ChartMenuSnapshot} from '../../src/chart/context-menu';
import {allIndicatorsFileName,allIndicatorsWorkbook,computeAllIndicators,drawingExportRows,indicatorSettingsText,type IndicatorExportEntry} from '../../src/ui/all-indicators-export';

// Built-in example bars (invented prices), cut to 900 bars to keep the run short.
const bars=demoDailyDataset('GME').bars.slice(-900);
const facts=()=>({resolution:'1D',calendar:'us-equity' as const});
function unzip(bytes:Uint8Array):Map<string,string>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map<string,string>();let end=bytes.length-22;while(view.getUint32(end,true)!==0x06054b50)end--;
 let offset=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
 for(let i=0;i<count;i++){
  expect(view.getUint32(offset,true)).toBe(0x02014b50);const method=view.getUint16(offset+10,true),crc=view.getUint32(offset+16,true),packed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),local=view.getUint32(offset+42,true);
  const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength)),start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),raw=bytes.subarray(start,start+packed);
  const data=method===8?new Uint8Array(inflateRawSync(raw)):raw;expect(data.length).toBe(size);expect(crc32(data)).toBe(crc);files.set(name,new TextDecoder().decode(data));offset+=46+nameLength;
 }
 return files;
}
const rows=(xml:string)=>[...xml.matchAll(/<row>(.*?)<\/row>|<row\/>/g)].map(match=>[...(match[1]??'').matchAll(/<c(?:\s[^>]*)?\/>|<c(?:\s[^>]*)?>(.*?)<\/c>/g)].map(cell=>cell[1]===undefined?null:(cell[1].match(/<v>(.*?)<\/v>/)?.[1]??cell[1].match(/<t[^>]*>(.*?)<\/t>/)?.[1]??null)));

let cached:IndicatorExportEntry[]|null=null;
const all=async()=>cached??=await computeAllIndicators(bars,facts,{retries:0});
const column=(entries:IndicatorExportEntry[],id:string,line:string)=>entries.find(entry=>entry.id===id)!.columns.find(row=>row.line===line)!;

describe('all-indicators export',()=>{
 it('every built-in of the Indicators dialog list is either exported as columns or listed as not available',async()=>{
  const entries=await all();
  expect(INDICATOR_KINDS).toHaveLength(223);
  expect(entries.map(entry=>entry.id).sort()).toEqual([...INDICATOR_KINDS].sort());
  for(const entry of entries)expect(entry.columns.length>0!==!!entry.unavailable).toBe(true);
  // Without a second-symbol loader, intrabar history or the chart's seasonality service these cannot run here.
  for(const id of ['correlation','spread','ratio','updownvolume','seasonality','tradingsessions'])expect(entries.find(entry=>entry.id===id)!.unavailable).toBeTruthy();
  expect(entries.find(entry=>entry.id==='cdlhammer')!.columns.every(row=>row.sheet==='Patterns')).toBe(true);
  expect(entries.find(entry=>entry.id==='macd')!.columns.map(row=>row.header)).toEqual(['MACD - MACD','MACD - Signal','MACD - Histogram']);
 },60000);
 it('values are the indicator\'s own calculation at its new-instance defaults',async()=>{
  const entries=await all(),rsi=calculateIndicator('rsi',bars,indicatorCreationInputs('rsi')).series.find(row=>row.id==='rsi')!.values;
  expect(column(entries,'rsi','RSI').values.at(-1)).toBe(rsi.at(-1));expect(typeof rsi.at(-1)).toBe('number');
  const macd=calculateIndicator('macd',bars,{source:'close',fast:12,slow:26,signal:9});
  for(const [id,line] of [['macd','MACD'],['signal','Signal'],['histogram','Histogram']])expect(column(entries,'macd',line).values).toEqual(macd.series.find(row=>row.id===id)!.values);
  expect(indicatorSettingsText('rsi')).toMatch(/Length 14/);
 });
 it('one indicator that throws is reported and never stops the others',async()=>{
  const evaluate:typeof evaluateDomainIndicator=(kind,...rest)=>{if(kind==='rsi')throw new Error('boom');return evaluateDomainIndicator(kind,...rest);};
  const entries=await computeAllIndicators(bars,facts,{kinds:['rsi','sma','ema'] as IndicatorId[],evaluate,retries:0});
  expect(entries.find(entry=>entry.id==='rsi')!.unavailable).toBe('Calculation failed: boom');
  expect(entries.filter(entry=>entry.columns.length).map(entry=>entry.id).sort()).toEqual(['ema','sma']);
 });
 it('writes a valid deflated workbook with Data, Patterns, Drawings and Key sheets',async()=>{
  const entries=await all(),drawings=drawingExportRows([{type:'trend_line',anchors:[{time:bars[10].time*1000,price:10},{time:bars[20].time*1000,price:12}],text:{value:'=note'}}]);
  const book=await allIndicatorsWorkbook({bars,symbol:'GME',interval:'1D',exampleData:true,sourceName:'Example',exportedAt:new Date(Date.UTC(2026,9,31)),entries,drawings,appVersion:'0.8.1'});
  expect(book.bytes.length).toBeLessThan(book.uncompressedBytes/3);
  const files=unzip(book.bytes);
  expect([...files.keys()]).toEqual(['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/worksheets/sheet3.xml','xl/worksheets/sheet4.xml']);
  expect(files.get('xl/workbook.xml')).toMatch(/name="Data".*name="Patterns".*name="Drawings".*name="Key"/);
  for(const text of files.values())expect(text).not.toMatch(/—|TradingView/);
  const data=rows(files.get('xl/worksheets/sheet1.xml')!),patterns=rows(files.get('xl/worksheets/sheet2.xml')!);
  expect(data).toHaveLength(bars.length+1);expect(data[0]).toHaveLength(6+book.dataColumns);expect(patterns[0]).toHaveLength(1+book.patternColumns);
  expect(files.get('xl/worksheets/sheet1.xml')).toContain('state="frozen"');
  // The last row's RSI cell is the plain String() of the number; the time is an Excel serial date.
  const rsiAt=data[0].indexOf('Relative Strength Index - RSI');expect(rsiAt).toBeGreaterThan(5);
  expect(Number(data.at(-1)![rsiAt])).toBe(column(entries,'rsi','RSI').values.at(-1));expect(Number(data[1][0])).toBeCloseTo(bars[0].time/86400+25569,9);expect(Number(data[1][4])).toBe(bars[0].close);
  const drawingRows=rows(files.get('xl/worksheets/sheet3.xml')!);expect(drawingRows[1][1]).toBe("'=note");expect(Number(drawingRows[1][3])).toBe(10);
  const key=files.get('xl/worksheets/sheet4.xml')!;
  expect(key).toContain('invented');expect((key.match(/Not available: /g)??[]).length).toBe(book.unavailable);
  expect(book.indicators+book.unavailable).toBe(223);
  const stored=unzip((await allIndicatorsWorkbook({bars:bars.slice(0,50),symbol:'GME',interval:'1D',exampleData:true,sourceName:'Example',exportedAt:new Date(0),entries:[],drawings:[]},{deflate:false})).bytes);
  expect(rows(stored.get('xl/worksheets/sheet3.xml')!)).toEqual([['Tool','Text']]);
  expect(allIndicatorsFileName('GME-SYNTHETIC')).toBe('GME-SYNTHETIC-all-indicators.xlsx');
 },60000);
 it('the chart menu offers the export right after Export chart data (CSV) when the host handles it',()=>{
  const snapshot={entity:{kind:'chart'},point:{price:99.5,unit:'price',pane:{kind:'price'}},instrument:{symbol:'GME',tickSize:0.01},input:{bars:[]},controller:{contextMenu:{isCurrent:()=>true}}} as unknown as ChartMenuSnapshot;
  const actions:ChartContextActions={'source-csv':()=>true,'indicators-xlsx':()=>true,'png-save':()=>true};
  expect(chartMenuEntries(snapshot,actions).map(row=>row.label)).toEqual(['Export chart data (CSV)','Export all indicators (.xlsx)','Save chart image']);
 });
});
