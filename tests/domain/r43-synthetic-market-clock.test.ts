import {expect,it,vi} from 'vitest';
import {readSyntheticMarketClock,syntheticMarketClockLabel,SYNTHETIC_MARKET_EPOCHS} from '../../src/domain/synthetic-market-clock';
import {usMarketSession} from '../../src/domain/us-market-hours';

it('keeps an ordinary status unmodified and never starts a fixture timer',()=>{
 const elapsed=vi.fn(()=>0),status={configured:true,keyIdHint:null,encryption:true};
 expect(readSyntheticMarketClock(status,elapsed)).toBeNull();expect(status).toEqual({configured:true,keyIdHint:null,encryption:true});expect(elapsed).not.toHaveBeenCalled();
});
it.each(['regular','closed'] as const)('anchors the named %s sample and advances with monotonic elapsed time',scenario=>{
 let elapsed=10;const clock=readSyntheticMarketClock({synthetic:true,syntheticClock:{scenario,nowMs:SYNTHETIC_MARKET_EPOCHS[scenario]}},()=>elapsed)!;
 expect(clock.now()).toBe(SYNTHETIC_MARKET_EPOCHS[scenario]);elapsed=2010;expect(clock.now()).toBe(SYNTHETIC_MARKET_EPOCHS[scenario]+2000);
 expect(usMarketSession(clock.now())).toBe(scenario==='regular'?'regular':'closed');
 elapsed=-10;expect(clock.now()).toBe(SYNTHETIC_MARKET_EPOCHS[scenario]+2000);
 expect(syntheticMarketClockLabel(clock)).toBe(`SYNTHETIC market clock | ${scenario==='regular'?'Regular session fixture':'Closed session fixture'} | ${scenario==='regular'?'2026-10-20T16:00:02.000Z':'2026-10-21T02:00:02.000Z'} | New York: ${scenario==='regular'?'regular session':'market closed'}`);
});
it.each([null,false,{}, {synthetic:false,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}}, {synthetic:true,syntheticClock:{scenario:'arbitrary',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}}, {synthetic:true,syntheticClock:{scenario:'regular',nowMs:String(SYNTHETIC_MARKET_EPOCHS.regular)}}, {synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular-1}}, {synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular+86400000}}, {synthetic:true,syntheticClock:{scenario:'regular',nowMs:Infinity}}, {synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular,extra:true}}])('refuses malformed fixture metadata without coercion: %#',status=>{
 if(status&&typeof status==='object'&&'syntheticClock' in status)expect(()=>readSyntheticMarketClock(status)).toThrow(/invalid/);else expect(readSyntheticMarketClock(status)).toBeNull();
});
it('reads only own primitive descriptors, with zero accessor or conversion calls',()=>{
 const getter=vi.fn(()=>SYNTHETIC_MARKET_EPOCHS.regular),valueOf=vi.fn(()=>SYNTHETIC_MARKET_EPOCHS.regular);
 const sample=Object.defineProperty({scenario:'regular'},'nowMs',{get:getter});
 expect(()=>readSyntheticMarketClock({synthetic:true,syntheticClock:sample})).toThrow(/invalid/);expect(getter).not.toHaveBeenCalled();
 expect(()=>readSyntheticMarketClock({synthetic:true,syntheticClock:{scenario:'regular',nowMs:{valueOf}}})).toThrow(/invalid/);expect(valueOf).not.toHaveBeenCalled();
 expect(()=>readSyntheticMarketClock({synthetic:true,syntheticClock:{scenario:'regular',nowMs:SYNTHETIC_MARKET_EPOCHS.regular}},()=>NaN)).toThrow(/invalid/);
});
