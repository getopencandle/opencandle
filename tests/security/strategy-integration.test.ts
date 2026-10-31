import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {backtestStrategy,type StrategySignal} from '../../src/domain/strategy';
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const closes=[2,4,8,10,6,12];
const source=`({onBar(ctx){if(ctx.index===0)ctx.order('buy',1);if(ctx.index===3)ctx.order('sell',1);}})`;
describe('independent script-to-authoritative-strategy contract',()=>{
  it('maps stable source identities to completed bars and matches the separate Pine numeric oracle after snapshot restore',async()=>{
    const bars=closes.map((close,index)=>({id:'synthetic-event-'+index,revision:1,time:1000,open:close,high:close+1,low:close-1,close,volume:1}));
    const jobs=new ScriptJobs();try{
      const full=await jobs.run({requestId:'strategy-full',source,bars});expect(full.ok).toBe(true);
      const first=await jobs.run({requestId:'strategy-first',source,bars:bars.slice(0,3)});expect(first.ok).toBe(true);
      const second=await jobs.run({requestId:'strategy-second',source,bars:bars.slice(3),snapshot:first.value.state});expect(second.ok).toBe(true);
      const index=new Map(bars.map((bar,position)=>[bar.id,position]));
      const mapOrders=(orders:any[]):StrategySignal[]=>orders.map(order=>({barIndex:index.get(order.event.id)!,sourceEventId:order.event.id,sourceRevision:order.event.revision,orders:[{id:'lvscript-'+order.sequence,action:order.side,quantity:order.quantity,type:'market'}]}));
      expect(mapOrders(full.value.orders).map(signal=>signal.barIndex)).toEqual([0,3]);
      const run=backtestStrategy({bars,barIds:bars.map(bar=>bar.id),barRevisions:bars.map(bar=>bar.revision),signals:mapOrders(full.value.orders),config:{initialCapital:1000,chartType:'range'}});
      const restored=backtestStrategy({bars,barIds:bars.map(bar=>bar.id),barRevisions:bars.map(bar=>bar.revision),signals:mapOrders([...first.value.orders,...second.value.orders]),config:{initialCapital:1000,chartType:'range'}});
      expect(run.ok,run.diagnostics.join('; ')).toBe(true);expect(restored).toEqual(run);
      expect(run.fills.map(fill=>[fill.barIndex,fill.price])).toEqual([[1,4],[4,6]]);
      expect(run.equity.map(point=>point.equity)).toEqual([1000,1000,1004,1006,1002,1002]);expect(run.metrics.netProfitClosed).toBe(2);
      const provisional=await jobs.run({requestId:'strategy-provisional',source,bars:bars.slice(3),snapshot:first.value.state,provisional:true});expect(provisional.ok).toBe(true);expect(provisional.value.orders).toEqual([]);
    }finally{jobs.close();}
  });
  it('rejects malformed HA signal bars even with valid standard execution bars and implements pyramiding zero first-entry semantics',()=>{
    const bars=closes.map((close,index)=>({time:index,open:close,high:close+1,low:close-1,close,volume:1}));
    const invalid=bars.map((bar,index)=>index===0?{...bar,close:NaN}:bar);
    const malformed=backtestStrategy({bars:invalid,standardBars:bars,signals:[],config:{chartType:'heikin-ashi',fillBasis:'standard-ohlc'}});
    expect(malformed.ok).toBe(false);expect(malformed.diagnostics.join(' ')).toContain('Invalid signal bar');
    const result=backtestStrategy({bars,signals:[{barIndex:0,orders:[{action:'buy',quantity:1}]},{barIndex:1,orders:[{action:'buy',quantity:1}]}],config:{initialCapital:1000,pyramiding:0}});
    expect(result.ok).toBe(true);expect(result.orders.map(order=>order.status)).toEqual(['filled','rejected']);
  });
});
