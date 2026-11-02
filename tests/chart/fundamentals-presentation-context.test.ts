import {afterEach,expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {validateIndicatorPresentationContext,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {sourceFundamentalsFacts} from '../../src/chart/adapter';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import {setFundamentalsLoader} from '../../src/domain/fundamentals-source';

// Synthetic bars and a synthetic instrument. The chart context is built the way the app builds it: the fundamentals facts
// come from the source basis identity, and EVERY indicator on the chart receives the same context.
const rows=Array.from({length:60},(_,i)=>({time:1700000000000+i*86400000,open:100+i,high:102+i,low:99+i,close:101+i+(i%3),volume:1000+i}));
const facts=sourceFundamentalsFacts(sourceContextForDataset(fixtureDataset('SYNW',60)))!;
afterEach(()=>{setFundamentalsLoader(null);});

it('a chart whose context carries fundamentals facts presents RSI, SMA and both fundamentals kinds on the real path',async()=>{
 expect(facts).toBeDefined();
 const context:IndicatorPresentationContext={resolution:'1D',calendar:'utc',style:'candles',paneInverted:null,fundamentals:facts};
 const t=await nativeCoreHarness();const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>context);
 const faults:unknown[]=[];t.chart.on('indicator:error',event=>faults.push(event));
 try{
  t.core.bars=rows;
  const rsi=port.add('rsi'),sma=port.add('sma'),fundamental=port.add('fundamental'),bands=port.add('pebands');
  port.recompute();
  expect(faults).toEqual([]);
  const listed=new Map(port.list().map(row=>[row.id,row]));
  for(const id of [rsi,sma]){
   const row=listed.get(id)!;
   expect(row.diagnostics.join(' ')).not.toMatch(/presentation requires/i);expect(row.presentationDiagnostics).toEqual([]);
   const model=t.native.scene.indicators.get(row.rendererId);
   expect(model.series.length).toBeGreaterThan(0);expect(model.series[0].points.some((point:any)=>Number.isFinite(point.value))).toBe(true);
  }
  // Without company data the fundamentals kinds stay empty and say why; they never fail the presentation.
  for(const id of [fundamental,bands]){const row=listed.get(id)!;expect(row.diagnostics.join(' ')).not.toMatch(/presentation requires/i);expect(row.diagnostics.length).toBeGreaterThan(0);}
 }finally{port.dispose();t.dispose();}
});

it('rejects a malformed fundamentals entry in the presentation context',()=>{
 const base={resolution:'1D'} as IndicatorPresentationContext;
 expect(()=>validateIndicatorPresentationContext({...base,fundamentals:facts})).not.toThrow();
 expect(()=>validateIndicatorPresentationContext({...base,fundamentals:{...facts,extra:1} as never})).toThrow(/bounded declared resolution/);
 expect(()=>validateIndicatorPresentationContext({...base,fundamentals:{...facts,synthetic:'yes'} as never})).toThrow(/bounded declared resolution/);
 expect(()=>validateIndicatorPresentationContext({...base,fundamentals:{...facts,adjustment:'dividends'} as never})).toThrow(/bounded declared resolution/);
 expect(()=>validateIndicatorPresentationContext({...base,unknown:true} as never)).toThrow(/bounded declared resolution/);
});
