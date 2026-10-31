import {expect,it} from 'vitest';
import {chartExportBasename,chartSourceCsv} from '../../src/ui/chart-source-export';
import {createRequire} from 'node:module';
import {csvRows} from '../../src/domain/data';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

it('keeps punctuation-bearing symbols in metadata while producing filenames accepted by the desktop boundary',()=>{
 const {dataExportInput,pngInput}=createRequire(import.meta.url)('../../electron/validation.cjs');
 for(const symbol of ['^SPX','../A/B','CON','.','GME','界'.repeat(150),'A'.repeat(150)]){
  const name=chartExportBasename(symbol,true);
  expect(()=>dataExportInput({text:'time,close\r\n1,2\r\n',format:'csv',suggestedName:name+'-bars.csv'})).not.toThrow();
  expect(()=>pngInput({pngDataUrl:'data:image/png;base64,iVBORw0KGgo=',suggestedName:name+'.png'})).not.toThrow();
 }
 expect(chartExportBasename('GME',true)).toBe('GME-SYNTHETIC');expect(chartExportBasename('^SPX',false)).toBe('_SPX-LOCAL');
 const data=fixtureDataset('SPY',3);data.instrument.symbol='^SPX';const rows=csvRows(chartSourceCsv({bars:data.bars,source:sourceContextForDataset(data),style:'candles'},'ordinary'));
 expect(rows[1][rows[0].indexOf('symbol')]).toBe('^SPX');
});

it('exports literal source OHLCV, missing volume and source provenance without a displayed-price substitution',()=>{
 const data=fixtureDataset('SPY',3);data.bars=[{time:10,open:10,high:15,low:9,close:14,volume:100},{time:20,open:14,high:20,low:13,close:18,volume:NaN}];data.provenance.providerName='=Untrusted, "label"';
 const rows=csvRows(chartSourceCsv({bars:data.bars,source:sourceContextForDataset(data),style:'heikinashi'},'synthetic-replay-1'));
 expect(rows).toHaveLength(3);expect(rows[1].slice(0,6)).toEqual(['10','10','15','9','14','100']);expect(rows[2].slice(0,6)).toEqual(['20','14','20','13','18','']);
 const last=Object.fromEntries(rows[0].map((key,index)=>[key,rows[2][index]]));expect(last).toMatchObject({symbol:'SPY',exchange:'SYNTHETIC',currency:'USD',provider:'\'=Untrusted, "label"',adjustment:'raw',session:'unknown',synthetic:'true',execution:'synthetic-replay-1',chart_style:'heikinashi',data_view:'source OHLCV'});
});
it('reads only a supplied prefix and rejects inconsistent source metadata',()=>{
 const data=fixtureDataset('GME',3),bars=data.bars.slice(0,1),source=sourceContextForDataset(data,bars);Object.defineProperty(data.bars,1,{get(){throw new Error('Future data read');}});
 expect(csvRows(chartSourceCsv({bars,source,style:'candles'},'replay')).length).toBe(2);expect(()=>chartSourceCsv({bars,source:{...source,fixture:false},style:'candles'},'replay')).toThrow('metadata');
});
it('bounds the full metadata-bearing UTF-8 output before returning a partial export',()=>{
 const data=fixtureDataset('GME',6000);data.provenance.providerName='界'.repeat(4000);expect(()=>chartSourceCsv({bars:data.bars,source:sourceContextForDataset(data),style:'candles'},'ordinary')).toThrow('20 MiB');
});
