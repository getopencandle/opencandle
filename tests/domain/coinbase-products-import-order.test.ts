import {afterEach,beforeEach,expect,it,vi} from 'vitest';
// Genuine cold module graphs. No mocked source exports, feeds, keys or UI mount.
beforeEach(()=>{vi.resetModules();vi.stubGlobal('fetch',()=>{throw Error('Import-only regression must not open a network request');});vi.stubGlobal('WebSocket',class{constructor(){throw Error('Import-only regression must not open a socket');}});});
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it.each(['provider','symbol-math','settings'] as const)('cold %s entry resolves the shared product list and dash-symbol parser',async entry=>{
 if(entry==='provider')await import('../../src/domain/coinbase-live');
 else if(entry==='symbol-math')await import('../../src/domain/symbol-math');
 else await import('../../src/ui/LiveDataSettings');
 const leaf=await import('../../src/domain/coinbase-products'),provider=await import('../../src/domain/coinbase-live'),math=await import('../../src/domain/symbol-math');
 expect(provider.COINBASE_PRODUCTS).toEqual(['BTC-USD','ETH-USD','SOL-USD']);expect(provider.COINBASE_PRODUCTS).toBe(leaf.COINBASE_PRODUCTS);
 expect(math.SYMBOL_MATH_DASH_SYMBOLS).toEqual(provider.COINBASE_PRODUCTS);expect(provider.isCoinbaseProduct('ETH-USD')).toBe(true);expect(provider.isCoinbaseProduct('DOGE-USD')).toBe(false);
 expect(math.parseSymbolMath('BTC-USD')).toMatchObject({ok:true,expression:{canonical:'BTC-USD',symbols:['BTC-USD']}});
 expect(math.parseSymbolMath('BTC-USD/ETH-USD')).toMatchObject({ok:true,expression:{canonical:'BTC-USD/ETH-USD',symbols:['BTC-USD','ETH-USD']}});
 expect(math.parseSymbolMath('GME-SPY')).toMatchObject({ok:true,expression:{symbols:['GME','SPY']}});
 expect(math.symbolMathComponentSource('BTC-USD')).toBe('coinbase');expect(math.symbolMathComponentSource('GME')).toBe('alpaca-or-import');
});
