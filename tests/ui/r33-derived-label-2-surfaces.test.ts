import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {composeChartExport} from '../../src/chart/image-export';
import {importSourceLabel} from '../../src/domain/data-setup';
import {symbolMathDatasetId} from '../../src/domain/symbol-math-live';
import type {BarDataset} from '../../src/domain/types';

// The short source words outside the chart heading. Before this lane a derived (symbol math) feed was
// "LOCAL IMPORT" with a real key and plain "SYNTHETIC" (or "SYNTHETIC DEMO" / "synthetic fixture") on the keyless stub;
// plain live and stub feeds were "LOCAL IMPORT" in the export footer and the grid strip picker too. These checks use only
// modules that existed before the lane, so they fail on the old code by behaviour (no new import). SYNTHETIC test data.
function exportFooter(source:{fixture:boolean;label:string;datasetId:string;revision:string}):string{
 const texts:string[]=[];const ctx:any={createLinearGradient:()=>({addColorStop:()=>{}}),fillRect:()=>{},drawImage:()=>{},save:()=>{},beginPath:()=>{},rect:()=>{},clip:()=>{},restore:()=>{},fillText:(text:string)=>texts.push(text)};
 composeChartExport({width:10,height:10} as HTMLCanvasElement,null,source,()=>({width:0,height:0,getContext:()=>ctx}) as unknown as HTMLCanvasElement);
 return texts.at(-1)!;
}
// Footer identity moved to nonvisible PNG metadata; all source-word assertions remain.
const derivedId=symbolMathDatasetId('GME/SPY','1D');

it('the image export footer tags a real-key derived chart DERIVED and a stub one SYNTHETIC DERIVED (was LOCAL IMPORT / SYNTHETIC)',()=>{
 expect(exportFooter({fixture:false,label:'Derived: GME/SPY from Alpaca Market Data (owner key, Basic plan)',datasetId:derivedId,revision:'d1'})).toBe(`OpenCandle · DERIVED · Derived: GME/SPY from Alpaca Market Data (owner key, Basic plan)`);
 expect(exportFooter({fixture:true,label:'SYNTHETIC · Derived: GME/SPY from SYNTHETIC Alpaca stub (invented prices)',datasetId:derivedId,revision:'d1'})).toMatch(/^OpenCandle · SYNTHETIC DERIVED · SYNTHETIC · Derived: GME\/SPY from /);
});
it('the image export footer tags plain live feeds LIVE and the keyless stub SYNTHETIC; imports and fixtures are unchanged',()=>{
 expect(exportFooter({fixture:false,label:'Alpaca Market Data (owner key, Basic plan)',datasetId:'live:alpaca-iex:GME:1D',revision:'1'})).toMatch(/^OpenCandle · LIVE · /);
 expect(exportFooter({fixture:false,label:'SYNTHETIC Alpaca stub (invented prices)',datasetId:'live:alpaca-stub:GME:1D',revision:'1'})).toMatch(/^OpenCandle · SYNTHETIC · /);
 expect(exportFooter({fixture:false,label:'Local import',datasetId:'import:GME',revision:'1'})).toBe('OpenCandle · LOCAL IMPORT · Local import');
 expect(exportFooter({fixture:true,label:'Synthetic fixture',datasetId:'synthetic-a',revision:'2'})).toBe('OpenCandle · SYNTHETIC · Synthetic fixture');
});
it('the import selector label tags a derived feed DERIVED, never LOCAL IMPORT',()=>{
 const derived={instrument:{id:'DERIVED:GME/SPY',symbol:'GME/SPY',name:'Derived: GME/SPY',exchange:'DERIVED',currency:'USD',assetClass:'stock',tickSize:0.0001,lotSize:1,timezone:'America/New_York'},resolution:'1D',bars:[{time:86400*20000,open:1,high:1,low:1,close:1,volume:NaN}],
  provenance:{providerId:'lv-symbol-math',providerName:'Derived: GME/SPY from Alpaca Market Data (owner key, Basic plan)',datasetId:derivedId,fixture:false,coverage:'c',asOf:0,delaySeconds:0,adjustment:'split-adjusted',session:'unknown',timezone:'America/New_York',state:'ready',license:'L',revision:'d1',notes:[]}} as unknown as BarDataset;
 expect(importSourceLabel(derived)).toMatch(/^GME\/SPY \| 1D \| DERIVED \| /);
 const imported={...derived,instrument:{...derived.instrument,symbol:'GME'},provenance:{...derived.provenance,providerId:'local-import',providerName:'Local import',datasetId:'import:GME'}} as BarDataset;
 expect(importSourceLabel(imported)).toMatch(/^GME \| 1D \| LOCAL IMPORT \| /);
});
it('the grid strip picker, watchlist rows and the source-change confirmation use the shared source words',()=>{
 const grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
 expect(grid).not.toContain("item.provenance.fixture?'SYNTHETIC':'LOCAL IMPORT'");
 expect(grid).toContain('sourceOptionLabel(item)');
 const watch=readFileSync('src/ui/WatchlistPanel.tsx','utf8');
 expect(watch).not.toContain("{dataset.provenance.fixture?' · SYNTHETIC DEMO':''}");
 expect(watch).toContain("{syntheticSuffix(dataset.provenance,DEMO_BADGE)!==''&&<small className=\"wl-badge wl-demo\">{DEMO_BADGE}</small>}");
 expect(watch).toContain("{syntheticSuffix(dataset.provenance,' · SYNTHETIC')}");
 const app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).not.toContain("nextDataset.provenance.fixture?'synthetic fixture':nextDataset.provenance.coverage");
 expect(app).toContain("sourceCoverageNote(nextDataset.provenance)");
});
