import {describe,it,expect} from 'vitest';
import {chartSourceCsv,chartCsvSavedMessage,chartSourceTermsLabel} from '../../src/ui/chart-source-export';
import {fixtureDataset} from '../../src/domain/fixtures';
import {csvRows} from '../../src/domain/data';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartCsvColumn} from '../../src/chart/chart-csv-capture';

const data=()=>{const value=fixtureDataset('GME',3);value.bars=[{time:100,open:10,high:12,low:9,close:11,volume:100},{time:160,open:11,high:15,low:10,close:14,volume:200},{time:400,open:14,high:16,low:11,close:12,volume:NaN}];return value;};
const input=()=>{const dataset=data();return {bars:dataset.bars,source:sourceContextForDataset(dataset),style:'heikinashi'};};
const col=(label:string,points:readonly [number,number|null][]):ChartCsvColumn=>({label,points:points.map(([time,value])=>({time,value}))});

describe(' chart CSV exact timestamp joins on synthetic accepted plot samples',()=>{
 it('preserves the existing twenty source columns and every source cell before appending plot values',()=>{
  const snapshot=input(),source=csvRows(chartSourceCsv(snapshot,'synthetic-replay')),result=csvRows(chartSourceCsv(snapshot,'synthetic-replay',[col('Simple Moving Average: SMA',[[100,null],[160,12],[400,13]])]));
  expect(source[0]).toHaveLength(20);expect(result[0]).toHaveLength(21);for(let i=0;i<source.length;i++)expect(result[i].slice(0,20)).toEqual(source[i]);
  expect(result.slice(1).map(row=>row.at(-1))).toEqual(['','12','13']);expect(result[1].slice(0,6)).toEqual(['100','10','12','9','11','100']);
 });
 it('leaves irregular, warmup and missing gaps empty and does not union future or off-grid timestamps into rows',()=>{
  const rows=csvRows(chartSourceCsv(input(),'ordinary',[col('Plot',[[99,999],[100,null],[130,777],[400,42],[401,888]])]));
  expect(rows.map(row=>row[0])).toEqual(['time','100','160','400']);expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['','','42']);
 });
 it('keeps actual displayed offsets and percent/indexed/rebased units without recalculation or last-value repetition',()=>{
  const rows=csvRows(chartSourceCsv(input(),'ordinary',[col('Offset SMA',[[160,null],[400,12],[640,13]]),col('Compare SPY percent',[[100,0],[400,25]]),col('Compare SPY indexed',[[100,100],[400,125]]),col('Compare SPY rebased',[[100,11],[400,13.75]])]));
  expect(rows.slice(1).map(row=>row.slice(20))).toEqual([['','0','100','11'],['','','',''],['12','25','125','13.75']]);
 });
 it('preserves fractional-time samples as unmatched gaps rather than rounding them onto a source bar',()=>{
  const rows=csvRows(chartSourceCsv(input(),'ordinary',[col('Script fractional sample',[[100.5,81],[400,82]])]));expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['','','82']);
 });
 it('uses existing CSV formula protection and quoting for untrusted human plot names',()=>{
  const labels=['=SUM(1,2)',' +cmd','@formula','\tstarts with tab','Script "quoted",\nnext line'];
  const rows=csvRows(chartSourceCsv(input(),'ordinary',labels.map(label=>col(label,[[100,-5]]))));expect(rows[0].slice(20)).toEqual(labels.map((label,index)=>index<4?"'"+label:label));expect(rows[1].slice(20)).toEqual(['-5','-5','-5','-5','-5']);
 });
 it('rejects ambiguous duplicate plot labels, duplicate times and nonfinite values instead of guessing an alignment',()=>{
  expect(()=>chartSourceCsv(input(),'ordinary',[col('Same',[]),col('Same',[])])).toThrow('distinct');expect(()=>chartSourceCsv(input(),'ordinary',[col('Duplicate',[[100,1],[100,2]])])).toThrow('increasing');expect(()=>chartSourceCsv(input(),'ordinary',[col('Infinity',[[100,Infinity]])])).toThrow('finite');
 });
 it('retains a supplied prefix and never asks for or fabricates a later source row',()=>{
  const snapshot=input();snapshot.bars=snapshot.bars.slice(0,1);snapshot.source=sourceContextForDataset(data(),snapshot.bars);
  const rows=csvRows(chartSourceCsv(snapshot,'synthetic-replay',[col('Script',[[100,4],[160,50],[400,60]])]));expect(rows).toHaveLength(2);expect(rows[1].at(-1)).toBe('4');
 });
 it('checks one capture proof before and after serialization, refusing a retired result before transport can occur',()=>{
  let checks=0;expect(()=>chartSourceCsv(input(),'ordinary',[col('Plot',[[100,1]])],()=>{if(++checks===2)throw Error('Synthetic owner retired');})).toThrow('owner retired');expect(checks).toBe(2);
 });
 it('enforces the existing UTF-8 byte limit incrementally even when headers alone would overflow it',()=>{
  const columns=Array.from({length:2400},(_,index)=>col('界'.repeat(3000)+' '+index,[]));expect(()=>chartSourceCsv(input(),'ordinary',columns)).toThrow('20 MiB');
 });
 it('exports a live source for personal analysis and states the provider terms after saving',()=>{
  const dataset=data();Object.assign(dataset.provenance,{datasetId:'live:synthetic-policy-test',providerId:'coinbase-public',providerName:'Synthetic live provider',fixture:false});
  const snapshot={bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles'},rows=csvRows(chartSourceCsv(snapshot,'ordinary',[]));
  expect(rows).toHaveLength(4);expect(rows[1].slice(9,12)).toEqual(['Synthetic live provider','coinbase-public','live:synthetic-policy-test']);
  expect(chartSourceTermsLabel(snapshot.source)).toBe('Synthetic live provider');expect(chartSourceTermsLabel(input().source)).toBeNull();
  expect(chartCsvSavedMessage('Chart data saved',snapshot.source,{})).toBe("Chart data saved. Market data from Synthetic live provider, saved for your personal analysis. The provider's terms apply: do not share or resell this file.");
  expect(chartCsvSavedMessage('Chart data saved',input().source,{omitted:['VRVP']})).toBe('Chart data saved. Left out (uses additional history): VRVP');
  expect(chartCsvSavedMessage('Chart data saved',input().source,{personalUse:['']})).toBe("Chart data saved. Market data from a connected provider, saved for your personal analysis. The provider's terms apply: do not share or resell this file.");
 });
});
