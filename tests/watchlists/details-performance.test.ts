import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {referenceFromDataset} from '../../src/watchlists/model';
import {watchQuote} from '../../src/watchlists/quotes';
import {prepareDetailSnapshot} from '../../src/watchlists/details';

it('measures bounded endpoint snapshots over two explicit 100000-bar supplied sources',()=>{
 const primary=fixtureDataset('GME',0);primary.provenance.datasetId='SYNTHETIC-details-benchmark-primary';primary.resolution='5';
 primary.bars=Array.from({length:100000},(_,index)=>({time:1700000000+index*300,open:10,high:12,low:9,close:11,volume:0}));
 const daily=fixtureDataset('GME',0);daily.provenance.datasetId='SYNTHETIC-details-benchmark-daily';daily.resolution='1D';
 daily.bars=Array.from({length:100000},(_,index)=>({time:1000000000+index*86400,open:15,high:17,low:14,close:16,volume:0}));
 const reference={...referenceFromDataset(primary),dailyDatasetId:daily.provenance.datasetId},quote=watchQuote(reference,[primary,daily]),preparation:number[]=[],checks:number[]=[];
 for(let index=0;index<21;index++){const started=performance.now(),view=prepareDetailSnapshot(reference,quote),prepared=performance.now();view.assertSource();const checked=performance.now();preparation.push(prepared-started);checks.push(checked-prepared);expect(view.snapshot.blocks.summary[0].value).toBe(11);expect(view.snapshot.blocks.daily.find(row=>row.label==='Daily snapshot volume')!.value).toBe(0);}
 const sourcePaths=['src/watchlists/details.ts','tests/watchlists/details-performance.test.ts'],report={createdAt:new Date().toISOString(),kind:'synchronous bounded model, not React/native GUI',rowsPerSource:100000,sourceCount:2,repetitions:21,targetPerCallMs:50,preparationMs:preparation,sourceCheckMs:checks,maxPreparationMs:Math.max(...preparation),maxSourceCheckMs:Math.max(...checks),setupExcluded:'Synthetic generation and existing watchQuote resolution are outside the measured new-details route.',sourceHashes:Object.fromEntries(sourcePaths.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),capturesCreated:0};
 writeFileSync('reports/symbol-details-performance.json',JSON.stringify(report,null,2)+'\n');
 expect(report.maxPreparationMs).toBeLessThan(50);expect(report.maxSourceCheckMs).toBeLessThan(50);
});
